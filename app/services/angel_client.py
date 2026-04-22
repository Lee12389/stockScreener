"""Angel One SmartAPI integration helpers."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pyotp

from app.config import get_settings

try:
    from SmartApi import SmartConnect
except Exception:  # pragma: no cover
    SmartConnect = None


class AngelClient:
    """Wraps the broker SDK with connection and candle convenience helpers."""

    def __init__(self) -> None:
        """Initializes the client with empty connection state."""
        self.settings = get_settings()
        self.client = None
        self.connected = False
        self.last_error = ''

    def connect(self) -> tuple[bool, str]:
        """Opens a SmartAPI session using the configured credentials."""
        if SmartConnect is None:
            self.last_error = 'smartapi-python is not available. Install dependencies first.'
            return False, self.last_error

        if not all([
            self.settings.angel_api_key,
            self.settings.angel_client_code,
            self.settings.angel_pin,
            self.settings.angel_totp_secret,
        ]):
            self.last_error = 'Missing Angel One credentials in environment.'
            return False, self.last_error

        try:
            self.client = SmartConnect(api_key=self.settings.angel_api_key)
            totp = pyotp.TOTP(self.settings.angel_totp_secret).now()
            data = self.client.generateSession(
                self.settings.angel_client_code,
                self.settings.angel_pin,
                totp,
            )
            status = bool(data.get('status'))
            if not status:
                self.last_error = str(data)
                self.connected = False
                return False, self.last_error
            self.client.getfeedToken()
            self.connected = True
            return True, 'Connected to Angel One SmartAPI.'
        except Exception as exc:  # pragma: no cover
            self.connected = False
            self.last_error = str(exc)
            return False, self.last_error

    def ensure_connected(self) -> tuple[bool, str]:
        """Returns an active broker session, connecting on demand if needed."""
        if self.is_connected():
            return True, 'already connected'
        return self.connect()

    def is_connected(self) -> bool:
        """Reports whether the SDK client is ready for broker calls."""
        return self.connected and self.client is not None

    def _safe_call(self, method_name: str, *args, **kwargs) -> Any:
        """Calls a SmartAPI method only when the client is connected."""
        if not self.is_connected():
            raise RuntimeError('Angel client is not connected.')
        method = getattr(self.client, method_name, None)
        if method is None:
            raise AttributeError(f'Method {method_name} not available in current SmartAPI SDK.')
        return method(*args, **kwargs)

    def resolve_symbol_token(self, exchange: str, symbol: str) -> tuple[str | None, str | None]:
        """Resolves a broker symbol token for the supplied trading symbol."""
        ex = exchange.strip().upper() or 'NSE'
        candidates = self._search_candidates(symbol)

        for query in candidates:
            try:
                result = self._safe_call('searchScrip', ex, query)
                rows = result.get('data') or []
            except Exception:
                continue

            symbol_u = symbol.strip().upper()
            for row in rows:
                t_symbol = (row.get('tradingsymbol') or '').upper().strip()
                if t_symbol == symbol_u:
                    return str(row.get('symboltoken') or ''), row.get('tradingsymbol')

            if rows:
                first = rows[0]
                return str(first.get('symboltoken') or ''), (first.get('tradingsymbol') or symbol)

        return None, None

    def fetch_candles(
        self,
        exchange: str,
        tradingsymbol: str,
        symboltoken: str,
        days: int = 730,
        interval: str = 'ONE_DAY',
    ) -> list[dict[str, float | str]]:
        """Fetches normalized OHLCV candles for a symbol and interval."""
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=days)
        params = {
            'exchange': exchange,
            'tradingsymbol': tradingsymbol,
            'symboltoken': symboltoken,
            'interval': interval,
            'fromdate': from_dt.strftime('%Y-%m-%d %H:%M'),
            'todate': to_dt.strftime('%Y-%m-%d %H:%M'),
        }
        data = self._safe_call('getCandleData', params)
        rows = data.get('data') or []
        candles = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 6:
                continue
            candles.append(
                {
                    'ts': str(row[0]),
                    'open': _as_float(row[1]) or 0.0,
                    'high': _as_float(row[2]) or 0.0,
                    'low': _as_float(row[3]) or 0.0,
                    'close': _as_float(row[4]) or 0.0,
                    'volume': _as_float(row[5]) or 0.0,
                }
            )
        return candles

    def fetch_top_performers(self, top_n: int, watchlist_symbols: list[str]) -> list[dict[str, Any]]:
        """Fetches a best-effort top-performer set from broker data."""
        try:
            data = self._safe_call('gainersLosers', {'datatype': 'PercOIGainers'})
            rows = data.get('data') or []
            normalized = []
            for row in rows[:top_n]:
                normalized.append({
                    'symbol': row.get('tradingsymbol') or row.get('symbol') or '',
                    'last_price': _as_float(row.get('ltp') or row.get('last_price')),
                    'change_pct': _as_float(row.get('pChange') or row.get('change_perc')),
                })
            normalized = [n for n in normalized if n['symbol']]
            if normalized:
                return normalized
        except Exception:
            pass

        ranked: list[dict[str, Any]] = []
        for symbol in watchlist_symbols:
            token, resolved_symbol = self.resolve_symbol_token('NSE', symbol)
            if not token:
                continue
            symbol_for_quote = resolved_symbol or symbol
            try:
                quote = self._safe_call('ltpData', 'NSE', symbol_for_quote, token)
                data = quote.get('data') or {}
                change_pct = _as_float(data.get('percentChange') or data.get('pChange'))
                ranked.append(
                    {
                        'symbol': symbol_for_quote,
                        'last_price': _as_float(data.get('ltp')),
                        'change_pct': change_pct,
                    }
                )
            except Exception:
                continue

        ranked.sort(key=lambda x: (x['change_pct'] if x['change_pct'] is not None else -9999), reverse=True)
        return ranked[:top_n]

    @staticmethod
    def _search_candidates(symbol: str) -> list[str]:
        """Builds alternate symbol spellings for broker search fallback."""
        s = symbol.strip().upper()
        cands: list[str] = []
        if s:
            cands.append(s)
        if s.endswith('-EQ'):
            cands.append(s[:-3])
        if s.endswith('.NS'):
            cands.append(s.replace('.NS', ''))
            cands.append(s.replace('.NS', '-EQ'))
        if '-' not in s and not s.endswith('.NS'):
            cands.append(f'{s}-EQ')
        dedup = []
        seen = set()
        for c in cands:
            if c and c not in seen:
                dedup.append(c)
                seen.add(c)
        return dedup


def _as_float(value: Any) -> float | None:
    """Safely converts broker response values into floats."""
    try:
        if value is None or value == '':
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
