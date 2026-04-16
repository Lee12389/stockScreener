from __future__ import annotations

from typing import Any

import pyotp

from app.config import get_settings

try:
    from SmartApi import SmartConnect
except Exception:  # pragma: no cover
    SmartConnect = None


class AngelClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = None
        self.connected = False
        self.last_error = ''

    def connect(self) -> tuple[bool, str]:
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

    def is_connected(self) -> bool:
        return self.connected and self.client is not None

    def _safe_call(self, method_name: str, *args, **kwargs) -> Any:
        if not self.is_connected():
            raise RuntimeError('Angel client is not connected.')
        method = getattr(self.client, method_name, None)
        if method is None:
            raise AttributeError(f'Method {method_name} not available in current SmartAPI SDK.')
        return method(*args, **kwargs)

    def fetch_top_performers(self, top_n: int, watchlist_symbols: list[str]) -> list[dict[str, Any]]:
        # 1) Preferred path: if SDK supports gainersLosers endpoint.
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

        # 2) Fallback path: compute ranking from watchlist quotes if LTP endpoint is available.
        ranked: list[dict[str, Any]] = []
        for symbol in watchlist_symbols:
            try:
                quote = self._safe_call('ltpData', 'NSE', symbol, '')
                data = quote.get('data') or {}
                change_pct = _as_float(data.get('percentChange') or data.get('pChange'))
                ranked.append(
                    {
                        'symbol': symbol,
                        'last_price': _as_float(data.get('ltp')),
                        'change_pct': change_pct,
                    }
                )
            except Exception:
                continue

        ranked.sort(key=lambda x: (x['change_pct'] if x['change_pct'] is not None else -9999), reverse=True)
        return ranked[:top_n]

    def place_order(self, order_params: dict[str, Any]) -> dict[str, Any]:
        try:
            order_id = self._safe_call('placeOrder', order_params)
            return {'ok': True, 'order_id': str(order_id), 'raw': order_id}
        except Exception as exc:
            return {'ok': False, 'error': str(exc)}


def _as_float(value: Any) -> float | None:
    try:
        if value is None or value == '':
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
