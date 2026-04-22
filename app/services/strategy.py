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
        self._market_cache: dict[str, tuple[datetime, dict[str, dict], str | None]] = {}
        self._dataset_cache: dict[str, tuple[datetime, list[dict], str | None]] = {}

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
            if not (row['close'] >= row['ema50'] and daily >= 50):
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
                    note=f"Trend confirmed (price>EMA50, RSI14>=50). VolWeight={row['volume_weight']:.2f}, SR-Prox={row['sr_proximity']:.2f}",
                    sparkline=row['sparkline'],
                )
            )

        hits.sort(
            key=lambda x: (
                len(x.triggers),
                market.get(x.symbol, {}).get('volume_weight', 1.0) * market.get(x.symbol, {}).get('sr_proximity', 0.0),
                x.change_pct,
                x.daily_rsi,
            ),
            reverse=True,
        )
        return hits, None

    def get_market_snapshot(
        self,
        force_refresh: bool = False,
        interval: str = 'ONE_DAY',
        use_weekly_monthly: bool = False,
        volume_multiplier: float = 1.5,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
        ) -> tuple[dict[str, dict], str | None]:
        return self._load_market_data(
            force_refresh=force_refresh,
            interval=interval,
            use_weekly_monthly=use_weekly_monthly,
            volume_multiplier=volume_multiplier,
            macd_fast=macd_fast,
            macd_slow=macd_slow,
            macd_signal=macd_signal,
        )

    def get_market_dataset(
        self,
        symbols: list[str],
        force_refresh: bool = False,
        interval: str = 'FIFTEEN_MINUTE',
        daily_days: int = 320,
    ) -> tuple[list[dict], str | None]:
        normalized_interval = _normalize_interval(interval)
        normalized = sorted({s.strip().upper() for s in symbols if s and s.strip()})
        if not normalized:
            return [], 'No symbols were provided for the scanner dataset.'

        cache_key = f"{normalized_interval}:{daily_days}:{'|'.join(normalized)}"
        cached = self._dataset_cache.get(cache_key)
        if cached and not force_refresh and datetime.utcnow() - cached[0] < self.cache_ttl:
            return cached[1], cached[2]

        ok, msg = self.angel_client.ensure_connected()
        if not ok:
            error = f'Angel session unavailable: {msg}'
            self._dataset_cache[cache_key] = (datetime.utcnow(), [], error)
            return [], error

        watch_map = {
            item.symbol.strip().upper(): item
            for item in self.watchlist_service.enabled_items()
        }

        dataset: list[dict] = []
        for symbol in normalized:
            item = watch_map.get(symbol)
            if item is None:
                continue

            exchange = (item.exchange or 'NSE').strip().upper() or 'NSE'
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
                candles, daily_candles = self._fetch_primary_and_daily_candles(
                    exchange=exchange,
                    tradingsymbol=resolved_symbol,
                    symboltoken=token,
                    interval=normalized_interval,
                    daily_days=max(daily_days, 365),
                    dataset_mode=True,
                )
            except Exception:
                continue

            if len(candles) < _minimum_candles_for_interval(normalized_interval):
                continue

            dataset.append(
                {
                    'symbol': resolved_symbol,
                    'exchange': exchange,
                    'sector': item.sector,
                    'source': item.source,
                    'symbol_token': token,
                    'interval': normalized_interval,
                    'candles': _pack_candles(candles[-240:]),
                    'daily_candles': _pack_candles(daily_candles[-max(daily_days, 260):]),
                }
            )

        self._dataset_cache[cache_key] = (datetime.utcnow(), dataset, None)
        return dataset, None

    def _fetch_primary_and_daily_candles(
        self,
        exchange: str,
        tradingsymbol: str,
        symboltoken: str,
        interval: str,
        daily_days: int,
        dataset_mode: bool = False,
    ) -> tuple[list[dict], list[dict]]:
        normalized_interval = _normalize_interval(interval)

        if normalized_interval in {'ONE_WEEK', 'ONE_MONTH'}:
            daily_source = self.angel_client.fetch_candles(
                exchange,
                tradingsymbol,
                symboltoken,
                days=_daily_source_days_for_interval(normalized_interval, daily_days),
                interval='ONE_DAY',
            )
            mode = 'week' if normalized_interval == 'ONE_WEEK' else 'month'
            primary = _aggregate_candles(daily_source, mode)
            return primary, daily_source

        primary = self.angel_client.fetch_candles(
            exchange,
            tradingsymbol,
            symboltoken,
            days=_source_days_for_interval(normalized_interval, dataset_mode=dataset_mode),
            interval=normalized_interval,
        )

        if normalized_interval == 'ONE_DAY':
            daily_source = primary[-max(daily_days, 260):]
        else:
            daily_source = self.angel_client.fetch_candles(
                exchange,
                tradingsymbol,
                symboltoken,
                days=max(daily_days + 40, 365),
                interval='ONE_DAY',
            )
        return primary, daily_source

    def scan_supertrend(self, force_refresh: bool = False) -> tuple[list[SupertrendHit], str | None]:
        market, error = self._load_market_data(force_refresh=force_refresh)
        if error:
            return [], error

        hits: list[SupertrendHit] = []
        for symbol, row in market.items():
            signal = row['super_signal']
            if 'BUY' in signal and row['close'] < row['ema50']:
                signal = 'HOLD'
            if 'SELL' in signal and row['close'] > row['ema50']:
                signal = 'HOLD'
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
                    note=f"Supertrend + S/R + Trend filter (EMA50). VolWeight={row['volume_weight']:.2f}, SR-Prox={row['sr_proximity']:.2f}",
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

    def _load_market_data(
        self,
        force_refresh: bool = False,
        interval: str = 'ONE_DAY',
        use_weekly_monthly: bool = False,
        volume_multiplier: float = 1.5,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
    ) -> tuple[dict[str, dict], str | None]:
        normalized_interval = _normalize_interval(interval)
        cache_key = ':'.join(
            [
                normalized_interval,
                'wm' if use_weekly_monthly else 'no-wm',
                f'vol{volume_multiplier:.2f}',
                f'mf{macd_fast}',
                f'ms{macd_slow}',
                f'msig{macd_signal}',
            ]
        )

        if not force_refresh:
            cached = self._market_cache.get(cache_key)
            if cached and datetime.utcnow() - cached[0] < self.cache_ttl:
                return cached[1], cached[2]
            if cached is None:
                return {}, 'No cached scan yet. Use force refresh to run the first scan.'

        ok, msg = self.angel_client.ensure_connected()
        if not ok:
            error = f'Angel session unavailable: {msg}'
            self._market_cache[cache_key] = (datetime.utcnow(), {}, error)
            return {}, error

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
                candles, daily_candles = self._fetch_primary_and_daily_candles(
                    exchange=exchange,
                    tradingsymbol=resolved_symbol,
                    symboltoken=token,
                    interval=normalized_interval,
                    daily_days=730 if use_weekly_monthly or normalized_interval in {'ONE_WEEK', 'ONE_MONTH'} else 365,
                    dataset_mode=False,
                )
            except Exception:
                continue

            if len(candles) < _minimum_candles_for_interval(normalized_interval):
                continue

            highs = [float(c['high']) for c in candles]
            lows = [float(c['low']) for c in candles]
            closes = [float(c['close']) for c in candles]
            volumes = [float(c.get('volume', 0.0)) for c in candles]

            if len(closes) < _minimum_candles_for_interval(normalized_interval):
                continue

            daily_rsi = _rsi_series(closes)
            if use_weekly_monthly:
                weekly_rsi = _rsi_series(_aggregate_last_close(daily_candles, 'week'))
                monthly_rsi = _rsi_series(_aggregate_last_close(daily_candles, 'month'))
            else:
                weekly_rsi = [daily_rsi[-1]] if daily_rsi else []
                monthly_rsi = [daily_rsi[-1]] if daily_rsi else []
            if len(daily_rsi) < 3 or not weekly_rsi or not monthly_rsi:
                continue

            supertrend_vals, is_bullish = _supertrend(highs, lows, closes, period=10, multiplier=3.0)
            support = min(lows[-20:])
            resistance = max(highs[-20:])
            close_now = closes[-1]
            ema50 = _ema(closes, 50)[-1]
            ema20 = _ema(closes, 20)[-1]
            ema100 = _ema(closes, 100)[-1]
            ema200 = _ema(closes, 200)[-1]
            macd_line, macd_sig, macd_hist = _macd(closes, fast=macd_fast, slow=macd_slow, signal=macd_signal)
            trend = 'UP' if close_now >= ema50 else 'DOWN'
            vol_ma20 = (sum(volumes[-20:]) / max(len(volumes[-20:]), 1)) if volumes else 0.0
            volume_ratio = (volumes[-1] / vol_ma20) if vol_ma20 > 0 else 1.0
            sr_nearest = min(abs(close_now - support), abs(resistance - close_now))
            sr_proximity = max(0.0, 1.0 - (sr_nearest / max(close_now * 0.02, 0.01)))
            volume_weight = max(0.5, min(3.0, volume_ratio / max(volume_multiplier, 0.1)))

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
                'ema20': ema20,
                'ema50': ema50,
                'ema100': ema100,
                'ema200': ema200,
                'trend': trend,
                'volume_ratio': volume_ratio,
                'volume_weight': volume_weight,
                'sr_proximity': sr_proximity,
                'macd': macd_line[-1] if macd_line else 0.0,
                'macd_signal': macd_sig[-1] if macd_sig else 0.0,
                'macd_hist': macd_hist[-1] if macd_hist else 0.0,
                'interval': normalized_interval,
                'sparkline': _sparkline_points(closes[-40:]),
            }

        self._market_cache[cache_key] = (datetime.utcnow(), out, None)
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


def _ema(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    alpha = 2.0 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append((v * alpha) + (out[-1] * (1 - alpha)))
    return out


def _macd(values: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[list[float], list[float], list[float]]:
    if not values:
        return [], [], []
    fast_ema = _ema(values, max(2, fast))
    slow_ema = _ema(values, max(3, slow))
    macd_line = [f - s for f, s in zip(fast_ema, slow_ema)]
    macd_signal = _ema(macd_line, max(2, signal))
    hist = [m - s for m, s in zip(macd_line, macd_signal)]
    return macd_line, macd_signal, hist


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


def _normalize_interval(interval: str) -> str:
    normalized = (interval or 'ONE_DAY').strip().upper()
    aliases = {
        'WEEKLY': 'ONE_WEEK',
        'MONTHLY': 'ONE_MONTH',
    }
    return aliases.get(normalized, normalized)


def _minimum_candles_for_interval(interval: str) -> int:
    normalized = _normalize_interval(interval)
    mapping = {
        'FIVE_MINUTE': 120,
        'FIFTEEN_MINUTE': 120,
        'ONE_HOUR': 120,
        'ONE_DAY': 120,
        'ONE_WEEK': 52,
        'ONE_MONTH': 24,
    }
    return mapping.get(normalized, 120)


def _source_days_for_interval(interval: str, dataset_mode: bool = False) -> int:
    normalized = _normalize_interval(interval)
    if dataset_mode:
        mapping = {
            'FIVE_MINUTE': 35,
            'FIFTEEN_MINUTE': 75,
            'ONE_HOUR': 180,
            'ONE_DAY': 420,
        }
    else:
        mapping = {
            'FIVE_MINUTE': 120,
            'FIFTEEN_MINUTE': 120,
            'ONE_HOUR': 365,
            'ONE_DAY': 730,
        }
    return mapping.get(normalized, 365)


def _daily_source_days_for_interval(interval: str, daily_days: int) -> int:
    normalized = _normalize_interval(interval)
    if normalized == 'ONE_WEEK':
        return max(daily_days, 1500)
    if normalized == 'ONE_MONTH':
        return max(daily_days, 2200)
    return max(daily_days, 365)


def _aggregate_candles(candles: list[dict], mode: str) -> list[dict]:
    buckets: dict[str, dict] = {}
    order: list[str] = []
    for candle in candles:
        dt = _parse_ts(str(candle.get('ts', '')))
        if dt is None:
            continue
        if mode == 'week':
            iso = dt.isocalendar()
            key = f'{iso.year}-W{iso.week:02d}'
        else:
            key = f'{dt.year}-{dt.month:02d}'

        row = buckets.get(key)
        if row is None:
            row = {
                'ts': key,
                'open': float(candle.get('open', 0.0)),
                'high': float(candle.get('high', 0.0)),
                'low': float(candle.get('low', 0.0)),
                'close': float(candle.get('close', 0.0)),
                'volume': float(candle.get('volume', 0.0)),
            }
            buckets[key] = row
            order.append(key)
            continue

        row['high'] = max(float(row['high']), float(candle.get('high', 0.0)))
        row['low'] = min(float(row['low']), float(candle.get('low', 0.0)))
        row['close'] = float(candle.get('close', 0.0))
        row['volume'] = float(row['volume']) + float(candle.get('volume', 0.0))

    return [buckets[key] for key in order]


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


def _pack_candles(candles: list[dict]) -> list[list[float | str]]:
    packed: list[list[float | str]] = []
    for candle in candles:
        packed.append(
            [
                str(candle.get('ts', '')),
                round(float(candle.get('open', 0.0)), 4),
                round(float(candle.get('high', 0.0)), 4),
                round(float(candle.get('low', 0.0)), 4),
                round(float(candle.get('close', 0.0)), 4),
                round(float(candle.get('volume', 0.0)), 2),
            ]
        )
    return packed


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
