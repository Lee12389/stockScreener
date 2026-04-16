from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class RsiHit:
    symbol: str
    exchange: str
    sector: str
    symbol_token: str
    monthly_rsi: float
    weekly_rsi: float
    daily_rsi: float
    change_pct: float
    triggers: list[str]
    stop_loss: float
    targets: list[int]
    action: str
    note: str
    sparkline: str


@dataclass
class SupertrendHit:
    symbol: str
    exchange: str
    sector: str
    symbol_token: str
    close: float
    change_pct: float
    support: float
    resistance: float
    supertrend: float
    signal: str
    note: str
    sparkline: str


@dataclass
class MergedHit:
    symbol: str
    exchange: str
    sector: str
    symbol_token: str
    change_pct: float
    monthly_rsi: float | None
    weekly_rsi: float | None
    daily_rsi: float | None
    stop_loss: float | None
    targets: list[int]
    support: float
    resistance: float
    supertrend: float
    signal: str
    triggers: list[str]
    note: str
    sparkline: str


class StrategyService:
    def __init__(self, angel_client, watchlist_service):
        self.angel_client = angel_client
        self.watchlist_service = watchlist_service
        self.cache_ttl = timedelta(minutes=5)
        self._market_cache: dict[str, dict] = {}
        self._market_cache_error: str | None = None
        self._market_cache_at: datetime | None = None

    def scan_rsa_flow(self, force_refresh: bool = False) -> tuple[list[RsiHit], str | None]:
        market, error = self._load_market_data(force_refresh=force_refresh)
        if error:
            return [], error

        hits: list[RsiHit] = []
        for symbol, row in market.items():
            monthly = row['monthly_rsi']
            weekly = row['weekly_rsi']
            daily = row['daily_rsi']
            prev_daily = row['prev_daily_rsi']
            if monthly <= 60 or weekly <= 60:
                continue

            tail10 = row['daily_rsi_tail10']
            tail20 = row['daily_rsi_tail20']

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

            targets = [70, 80] if daily >= 60 else [50, 60, 70]

            hits.append(
                RsiHit(
                    symbol=symbol,
                    exchange=row['exchange'],
                    sector=row['sector'],
                    symbol_token=row['symbol_token'],
                    monthly_rsi=round(monthly, 2),
                    weekly_rsi=round(weekly, 2),
                    daily_rsi=round(daily, 2),
                    change_pct=round(row['change_pct'], 2),
                    triggers=triggers,
                    stop_loss=round(row['previous_day_low'], 2),
                    targets=targets,
                    action='BUY',
                    note='Monthly/Weekly strength confirmed; SL is previous day low.',
                    sparkline=row['sparkline'],
                )
            )

        hits.sort(key=lambda x: (len(x.triggers), x.change_pct, x.daily_rsi), reverse=True)
        return hits, None

    def scan_supertrend(self, force_refresh: bool = False) -> tuple[list[SupertrendHit], str | None]:
        market, error = self._load_market_data(force_refresh=force_refresh)
        if error:
            return [], error

        hits: list[SupertrendHit] = []
        for symbol, row in market.items():
            signal = row['super_signal']
            if signal == 'HOLD':
                continue
            hits.append(
                SupertrendHit(
                    symbol=symbol,
                    exchange=row['exchange'],
                    sector=row['sector'],
                    symbol_token=row['symbol_token'],
                    close=round(row['close'], 2),
                    change_pct=round(row['change_pct'], 2),
                    support=round(row['support'], 2),
                    resistance=round(row['resistance'], 2),
                    supertrend=round(row['supertrend_value'], 2),
                    signal=signal,
                    note='Supertrend + recent 20-candle support/resistance levels.',
                    sparkline=row['sparkline'],
                )
            )

        hits.sort(key=lambda x: (x.signal.startswith('STRONG'), x.change_pct), reverse=True)
        return hits, None

    def scan_merged(self, force_refresh: bool = False) -> tuple[list[MergedHit], str | None]:
        rsi_hits, error = self.scan_rsa_flow(force_refresh=force_refresh)
        if error:
            return [], error

        super_hits, _ = self.scan_supertrend(force_refresh=False)
        rsi_map = {h.symbol: h for h in rsi_hits}
        super_map = {h.symbol: h for h in super_hits}

        symbols = set(rsi_map.keys()) | set(super_map.keys())
        merged: list[MergedHit] = []
        for symbol in symbols:
            r = rsi_map.get(symbol)
            s = super_map.get(symbol)
            if r is None and s is None:
                continue

            signal = _merge_signal(r.action if r else 'HOLD', s.signal if s else 'HOLD')
            if signal == 'HOLD':
                continue

            base = s or r
            if base is None:
                continue

            merged.append(
                MergedHit(
                    symbol=base.symbol,
                    exchange=base.exchange,
                    sector=base.sector,
                    symbol_token=base.symbol_token,
                    change_pct=round((s.change_pct if s else r.change_pct), 2),
                    monthly_rsi=round(r.monthly_rsi, 2) if r else None,
                    weekly_rsi=round(r.weekly_rsi, 2) if r else None,
                    daily_rsi=round(r.daily_rsi, 2) if r else None,
                    stop_loss=round(r.stop_loss, 2) if r else None,
                    targets=(r.targets if r else []),
                    support=round(s.support, 2) if s else 0.0,
                    resistance=round(s.resistance, 2) if s else 0.0,
                    supertrend=round(s.supertrend, 2) if s else 0.0,
                    signal=signal,
                    triggers=(r.triggers if r else []),
                    note='Merged signal from RSI and Supertrend.',
                    sparkline=(s.sparkline if s else r.sparkline),
                )
            )

        merged.sort(key=lambda x: (_signal_rank(x.signal), x.change_pct), reverse=True)
        return merged, None

    def _load_market_data(self, force_refresh: bool = False) -> tuple[dict[str, dict], str | None]:
        if not force_refresh:
            if self._market_cache_at and datetime.utcnow() - self._market_cache_at < self.cache_ttl:
                return self._market_cache, self._market_cache_error
            if self._market_cache_at is None:
                return {}, 'No cached scan yet. Use force refresh to run the first scan.'

        ok, msg = self.angel_client.ensure_connected()
        if not ok:
            self._market_cache = {}
            self._market_cache_error = f'Angel session unavailable: {msg}'
            self._market_cache_at = datetime.utcnow()
            return self._market_cache, self._market_cache_error

        out: dict[str, dict] = {}
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

            highs = [float(c['high']) for c in candles]
            lows = [float(c['low']) for c in candles]
            closes = [float(c['close']) for c in candles]

            if len(closes) < 120:
                continue

            daily_rsi = _rsi_series(closes)
            weekly_rsi = _rsi_series(_aggregate_last_close(candles, 'week'))
            monthly_rsi = _rsi_series(_aggregate_last_close(candles, 'month'))
            if len(daily_rsi) < 3 or not weekly_rsi or not monthly_rsi:
                continue

            supertrend_vals, is_bullish = _supertrend(highs, lows, closes, period=10, multiplier=3.0)
            support = min(lows[-20:])
            resistance = max(highs[-20:])
            close_now = closes[-1]

            if is_bullish and close_now >= resistance * 0.998:
                super_signal = 'STRONG_BUY'
            elif is_bullish:
                super_signal = 'BUY'
            elif (not is_bullish) and close_now <= support * 1.002:
                super_signal = 'STRONG_SELL'
            elif not is_bullish:
                super_signal = 'SELL'
            else:
                super_signal = 'HOLD'

            prev_close = closes[-2] if len(closes) > 1 else closes[-1]
            change_pct = ((close_now - prev_close) / prev_close * 100.0) if prev_close else 0.0

            out[resolved_symbol] = {
                'symbol': resolved_symbol,
                'exchange': exchange,
                'sector': item.sector,
                'symbol_token': token,
                'monthly_rsi': monthly_rsi[-1],
                'weekly_rsi': weekly_rsi[-1],
                'daily_rsi': daily_rsi[-1],
                'prev_daily_rsi': daily_rsi[-2],
                'daily_rsi_tail10': daily_rsi[-10:],
                'daily_rsi_tail20': daily_rsi[-20:],
                'previous_day_low': lows[-2] if len(lows) > 1 else lows[-1],
                'change_pct': change_pct,
                'support': support,
                'resistance': resistance,
                'supertrend_value': supertrend_vals[-1],
                'super_signal': super_signal,
                'close': close_now,
                'sparkline': _sparkline_points(closes[-40:]),
            }

        self._market_cache = out
        self._market_cache_error = None
        self._market_cache_at = datetime.utcnow()
        return out, None


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


def _supertrend(highs: list[float], lows: list[float], closes: list[float], period: int = 10, multiplier: float = 3.0):
    trs: list[float] = []
    for i in range(len(closes)):
        if i == 0:
            tr = highs[i] - lows[i]
        else:
            tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        trs.append(tr)

    atr: list[float] = []
    for i in range(len(trs)):
        if i < period:
            atr.append(sum(trs[: i + 1]) / (i + 1))
        else:
            atr.append(((atr[-1] * (period - 1)) + trs[i]) / period)

    upper_basic = [((highs[i] + lows[i]) / 2.0) + multiplier * atr[i] for i in range(len(closes))]
    lower_basic = [((highs[i] + lows[i]) / 2.0) - multiplier * atr[i] for i in range(len(closes))]

    upper_final = upper_basic[:]
    lower_final = lower_basic[:]
    supertrend = [upper_basic[0]]
    bullish = [False]

    for i in range(1, len(closes)):
        upper_final[i] = upper_basic[i] if (upper_basic[i] < upper_final[i - 1] or closes[i - 1] > upper_final[i - 1]) else upper_final[i - 1]
        lower_final[i] = lower_basic[i] if (lower_basic[i] > lower_final[i - 1] or closes[i - 1] < lower_final[i - 1]) else lower_final[i - 1]

        prev_st = supertrend[i - 1]
        if prev_st == upper_final[i - 1]:
            if closes[i] <= upper_final[i]:
                supertrend.append(upper_final[i])
                bullish.append(False)
            else:
                supertrend.append(lower_final[i])
                bullish.append(True)
        else:
            if closes[i] >= lower_final[i]:
                supertrend.append(lower_final[i])
                bullish.append(True)
            else:
                supertrend.append(upper_final[i])
                bullish.append(False)

    return supertrend, bullish[-1]


def _merge_signal(rsi_action: str, super_signal: str) -> str:
    if super_signal in {'STRONG_BUY', 'STRONG_SELL'}:
        return super_signal
    if super_signal == 'BUY' and rsi_action == 'BUY':
        return 'STRONG_BUY'
    if super_signal == 'SELL' and rsi_action == 'BUY':
        return 'HOLD'
    if super_signal in {'BUY', 'SELL'}:
        return super_signal
    if rsi_action == 'BUY':
        return 'BUY'
    return 'HOLD'


def _signal_rank(signal: str) -> int:
    order = {'STRONG_BUY': 5, 'BUY': 4, 'HOLD': 3, 'SELL': 2, 'STRONG_SELL': 1}
    return order.get(signal, 0)


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
