from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class StrategyHit:
    symbol: str
    exchange: str
    sector: str
    symbol_token: str
    monthly_rsi: float
    weekly_rsi: float
    daily_rsi: float
    change_pct: float
    triggers: list[str]
    note: str
    sparkline: str


class StrategyService:
    def __init__(self, angel_client, watchlist_service):
        self.angel_client = angel_client
        self.watchlist_service = watchlist_service
        self._cache_hits: list[StrategyHit] = []
        self._cache_error: str | None = None
        self._cache_at: datetime | None = None
        self.cache_ttl = timedelta(minutes=5)

    def scan_rsa_flow(self, force_refresh: bool = False) -> tuple[list[StrategyHit], str | None]:
        if not force_refresh:
            if self._cache_at and datetime.utcnow() - self._cache_at < self.cache_ttl:
                return self._cache_hits, self._cache_error
            if self._cache_at is None:
                return [], 'No cached scan yet. Use force refresh to run the first scan.'

        ok, msg = self.angel_client.ensure_connected()
        if not ok:
            self._cache_hits = []
            self._cache_error = f'Angel session unavailable: {msg}'
            self._cache_at = datetime.utcnow()
            return self._cache_hits, self._cache_error

        hits: list[StrategyHit] = []

        for item in self.watchlist_service.enabled_items():
            exchange = item.exchange or 'NSE'
            symbol = item.symbol
            token = (item.symbol_token or '').strip()
            resolved_symbol = symbol

            if not token:
                resolved_token, resolved_symbol_name = self.angel_client.resolve_symbol_token(exchange, symbol)
                if not resolved_token:
                    continue
                token = resolved_token
                if resolved_symbol_name:
                    resolved_symbol = resolved_symbol_name
                self.watchlist_service.update_token(symbol, exchange, token)

            try:
                candles = self.angel_client.fetch_candles(exchange, resolved_symbol, token, days=730)
            except Exception:
                continue

            if len(candles) < 120:
                continue

            daily_closes = [c['close'] for c in candles if c.get('close') is not None]
            if len(daily_closes) < 120:
                continue

            daily_rsi_series = _rsi_series(daily_closes)
            if len(daily_rsi_series) < 3:
                continue

            weekly_closes = _aggregate_last_close(candles, 'week')
            monthly_closes = _aggregate_last_close(candles, 'month')
            weekly_rsi_series = _rsi_series(weekly_closes)
            monthly_rsi_series = _rsi_series(monthly_closes)
            if not weekly_rsi_series or not monthly_rsi_series:
                continue

            daily = daily_rsi_series[-1]
            prev_daily = daily_rsi_series[-2]
            weekly = weekly_rsi_series[-1]
            monthly = monthly_rsi_series[-1]

            if monthly <= 60 or weekly <= 60:
                continue

            tail10 = daily_rsi_series[-10:] if len(daily_rsi_series) >= 10 else daily_rsi_series
            tail20 = daily_rsi_series[-20:] if len(daily_rsi_series) >= 20 else daily_rsi_series

            cross_40 = prev_daily < 40 <= daily
            cross_60 = prev_daily < 60 <= daily
            bounce_40 = (min(tail10) < 40) and (daily > 40) and (daily >= prev_daily)
            bounce_60 = (min(tail20) < 60) and (daily > 60) and (daily >= prev_daily)

            triggers = []
            if cross_40:
                triggers.append('cross_above_40')
            if cross_60:
                triggers.append('cross_above_60')
            if bounce_40:
                triggers.append('bounce_from_40_zone')
            if bounce_60:
                triggers.append('bounce_from_60_zone')
            if not triggers:
                continue

            prev_close = daily_closes[-2] if len(daily_closes) > 1 else daily_closes[-1]
            change_pct = ((daily_closes[-1] - prev_close) / prev_close * 100.0) if prev_close else 0.0
            sparkline = _sparkline_points(daily_closes[-40:])

            hits.append(
                StrategyHit(
                    symbol=resolved_symbol,
                    exchange=exchange,
                    sector=item.sector,
                    symbol_token=token,
                    monthly_rsi=round(monthly, 2),
                    weekly_rsi=round(weekly, 2),
                    daily_rsi=round(daily, 2),
                    change_pct=round(change_pct, 2),
                    triggers=triggers,
                    note='Monthly/Weekly strength confirmed; Daily RSI trigger active.',
                    sparkline=sparkline,
                )
            )

        hits.sort(key=lambda x: (len(x.triggers), x.change_pct, x.daily_rsi), reverse=True)
        self._cache_hits = hits
        self._cache_error = None
        self._cache_at = datetime.utcnow()
        return hits, None


def _rsi_series(closes: list[float], period: int = 14) -> list[float]:
    if len(closes) < period + 1:
        return []

    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    rsi_values = [50.0] * period
    for i in range(period, len(deltas)):
        avg_gain = ((avg_gain * (period - 1)) + gains[i]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[i]) / period
        if avg_loss == 0:
            rsi = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi = 100.0 - (100.0 / (1.0 + rs))
        rsi_values.append(rsi)

    while len(rsi_values) < len(closes):
        rsi_values.insert(0, 50.0)
    return rsi_values[-len(closes):]


def _aggregate_last_close(candles: list[dict], mode: str) -> list[float]:
    buckets: dict[str, float] = {}
    for c in candles:
        ts = str(c.get('ts', ''))
        close = float(c.get('close', 0.0))
        dt = _parse_ts(ts)
        if dt is None:
            continue
        if mode == 'week':
            key = f"{dt.isocalendar().year}-W{dt.isocalendar().week:02d}"
        else:
            key = f"{dt.year}-{dt.month:02d}"
        buckets[key] = close
    return list(buckets.values())


def _parse_ts(ts: str) -> datetime | None:
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(ts, fmt)
        except ValueError:
            continue
    return None


def _sparkline_points(values: list[float]) -> str:
    if not values:
        return ''
    vmin = min(values)
    vmax = max(values)
    span = (vmax - vmin) or 1.0
    step_x = 100.0 / max(len(values) - 1, 1)

    points: list[str] = []
    for idx, v in enumerate(values):
        x = idx * step_x
        y = 30.0 - (((v - vmin) / span) * 30.0)
        points.append(f'{x:.2f},{y:.2f}')
    return ' '.join(points)
