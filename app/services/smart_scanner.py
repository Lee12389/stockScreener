from __future__ import annotations

import hashlib
import json

from app.db import BoughtMonitor, ScanResultCache, ScannerConfig, SessionLocal
from app.services.universe import build_universe


class SmartScannerService:
    def __init__(self, strategy_service, watchlist_service):
        self.strategy_service = strategy_service
        self.watchlist_service = watchlist_service

    def get_config(self) -> dict:
        with SessionLocal() as session:
            cfg = session.get(ScannerConfig, 1)
            if cfg is None:
                cfg = ScannerConfig(id=1)
                session.add(cfg)
                session.commit()
            return _cfg_to_dict(cfg)

    def update_config(self, payload: dict) -> dict:
        with SessionLocal() as session:
            cfg = session.get(ScannerConfig, 1)
            if cfg is None:
                cfg = ScannerConfig(id=1)
                session.add(cfg)
            for k, v in payload.items():
                if hasattr(cfg, k):
                    setattr(cfg, k, v)
            session.commit()
            return _cfg_to_dict(cfg)

    def scan(self, force_refresh: bool = False) -> dict:
        cfg = self.get_config()

        watch_custom = [w.symbol for w in self.watchlist_service.enabled_items() if w.source == 'manual']
        universe = build_universe(
            include_nifty50=(cfg['include_nifty50'] == 'true'),
            include_midcap150=(cfg['include_midcap150'] == 'true'),
            include_nifty500=(cfg['include_nifty500'] == 'true'),
            custom_symbols=watch_custom,
        )

        self.watchlist_service.bulk_add(universe, sector='Universe', source='scanner_universe')

        market, err = self.strategy_service.get_market_snapshot(
            force_refresh=force_refresh,
            interval=cfg['scan_interval'],
            use_weekly_monthly=(cfg['use_weekly_monthly'] == 'true'),
            volume_multiplier=cfg['volume_multiplier'],
            macd_fast=cfg['macd_fast'],
            macd_slow=cfg['macd_slow'],
            macd_signal=cfg['macd_signal'],
        )
        if err:
            return {'error': err, 'hits': [], 'count': 0}

        config_hash = _hash_cfg(cfg)

        with SessionLocal() as session:
            hits = []
            for symbol, row in market.items():
                if symbol not in universe:
                    continue
                candle_last_ts = row.get('interval', '') + ':' + str(round(row.get('close', 0.0), 2))
                cached = (
                    session.query(ScanResultCache)
                    .filter(
                        ScanResultCache.symbol == symbol,
                        ScanResultCache.timeframe == cfg['scan_interval'],
                        ScanResultCache.config_hash == config_hash,
                        ScanResultCache.candle_last_ts == candle_last_ts,
                    )
                    .first()
                )
                if cached and not force_refresh:
                    payload = json.loads(cached.payload)
                    if payload.get('score', 0) >= 0.25:
                        hits.append(payload)
                    continue

                scan = _evaluate_row(row, cfg)
                cache_row = (
                    session.query(ScanResultCache)
                    .filter(ScanResultCache.symbol == symbol, ScanResultCache.timeframe == cfg['scan_interval'])
                    .first()
                )
                if cache_row is None:
                    cache_row = ScanResultCache(
                        symbol=symbol,
                        timeframe=cfg['scan_interval'],
                        config_hash=config_hash,
                        candle_last_ts=candle_last_ts,
                        payload=json.dumps(scan),
                    )
                    session.add(cache_row)
                else:
                    cache_row.config_hash = config_hash
                    cache_row.candle_last_ts = candle_last_ts
                    cache_row.payload = json.dumps(scan)

                if scan['score'] >= 0.25:
                    hits.append(scan)

            session.commit()

        hits.sort(key=lambda x: (x['score'], x['volume_ratio'], x['change_pct']), reverse=True)
        return {'count': len(hits), 'hits': hits, 'config': cfg}

    def add_bought(self, symbol: str, entry_price: float, quantity: int, note: str = '') -> dict:
        with SessionLocal() as session:
            row = session.query(BoughtMonitor).filter(BoughtMonitor.symbol == symbol).first()
            if row is None:
                row = BoughtMonitor(symbol=symbol, exchange='NSE', entry_price=entry_price, quantity=quantity, note=note)
                session.add(row)
            else:
                row.entry_price = entry_price
                row.quantity = quantity
                row.note = note
            session.commit()
        return {'ok': True}

    def remove_bought(self, symbol: str) -> dict:
        with SessionLocal() as session:
            row = session.query(BoughtMonitor).filter(BoughtMonitor.symbol == symbol).first()
            if row:
                session.delete(row)
                session.commit()
        return {'ok': True}

    def monitor_bought(self, force_refresh: bool = False) -> dict:
        cfg = self.get_config()
        market, err = self.strategy_service.get_market_snapshot(
            force_refresh=force_refresh,
            interval=cfg['scan_interval'],
            use_weekly_monthly=(cfg['use_weekly_monthly'] == 'true'),
            volume_multiplier=cfg['volume_multiplier'],
            macd_fast=cfg['macd_fast'],
            macd_slow=cfg['macd_slow'],
            macd_signal=cfg['macd_signal'],
        )
        if err:
            return {'error': err, 'count': 0, 'items': []}

        with SessionLocal() as session:
            rows = session.query(BoughtMonitor).all()
            items = []
            for b in rows:
                row = market.get(b.symbol)
                if row is None:
                    continue
                weak, strong, reasons = _reversal_flags(row)
                price = row.get('close', 0.0)
                pnl = (price - b.entry_price) * b.quantity
                state = 'HOLD'
                color = ''
                if strong:
                    state = 'STRONG_SELL'
                    color = 'deep-red'
                elif weak:
                    state = 'WEAK_SELL'
                    color = 'light-red'

                items.append(
                    {
                        'symbol': b.symbol,
                        'entry_price': b.entry_price,
                        'quantity': b.quantity,
                        'ltp': round(price, 2),
                        'pnl': round(pnl, 2),
                        'state': state,
                        'color': color,
                        'reasons': reasons,
                        'note': b.note,
                        'sparkline': row.get('sparkline', ''),
                    }
                )
        return {'count': len(items), 'items': items, 'config': cfg}


def _cfg_to_dict(cfg) -> dict:
    return {
        'include_nifty50': cfg.include_nifty50,
        'include_midcap150': cfg.include_midcap150,
        'include_nifty500': cfg.include_nifty500,
        'scan_interval': cfg.scan_interval,
        'use_weekly_monthly': cfg.use_weekly_monthly,
        'volume_multiplier': cfg.volume_multiplier,
        'macd_fast': cfg.macd_fast,
        'macd_slow': cfg.macd_slow,
        'macd_signal': cfg.macd_signal,
        'show_ema': cfg.show_ema,
        'show_rsi': cfg.show_rsi,
        'show_macd': cfg.show_macd,
        'show_supertrend': cfg.show_supertrend,
        'show_volume': cfg.show_volume,
        'show_sr': cfg.show_sr,
    }


def _hash_cfg(cfg: dict) -> str:
    txt = json.dumps(cfg, sort_keys=True)
    return hashlib.sha256(txt.encode('utf-8')).hexdigest()


def _evaluate_row(row: dict, cfg: dict) -> dict:
    rsi = float(row.get('daily_rsi', 50.0))
    w_rsi = float(row.get('weekly_rsi', rsi))
    m_rsi = float(row.get('monthly_rsi', rsi))
    close = float(row.get('close', 0.0))
    ema20 = float(row.get('ema20', close))
    ema50 = float(row.get('ema50', close))
    ema100 = float(row.get('ema100', close))
    ema200 = float(row.get('ema200', close))
    support = float(row.get('support', close))
    resistance = float(row.get('resistance', close))
    macd = float(row.get('macd', 0.0))
    macd_sig = float(row.get('macd_signal', 0.0))
    vol_ratio = float(row.get('volume_ratio', 1.0))
    super_sig = str(row.get('super_signal', 'HOLD'))

    trend_ok = close > ema50 and ema20 > ema50 and ema50 > ema100
    rsi_ok = rsi > 50
    mtf_ok = (w_rsi > 50 and m_rsi > 50) if cfg['use_weekly_monthly'] == 'true' else True
    breakout = close >= (resistance * 0.998)
    vol_ok = vol_ratio >= cfg['volume_multiplier']

    score = 0.0
    score += 0.2 if trend_ok else -0.1
    score += 0.15 if rsi_ok else -0.15
    score += 0.1 if mtf_ok else -0.05
    score += 0.2 if breakout else 0.0
    score += 0.15 if vol_ok else -0.05
    score += 0.15 if macd > macd_sig else -0.1
    score += 0.1 if 'BUY' in super_sig else (-0.1 if 'SELL' in super_sig else 0.0)

    reasons = []
    if trend_ok:
        reasons.append('EMA trend aligned (20>50>100).')
    if rsi_ok:
        reasons.append('RSI14 above 50.')
    if mtf_ok and cfg['use_weekly_monthly'] == 'true':
        reasons.append('Weekly/Monthly RSI confirmation.')
    if breakout:
        reasons.append('Price breaking major resistance zone.')
    if vol_ok:
        reasons.append(f"Volume {vol_ratio:.2f}x >= {cfg['volume_multiplier']:.2f}x")

    return {
        'symbol': row.get('symbol'),
        'interval': row.get('interval'),
        'score': round(score, 3),
        'signal': 'BUY' if score >= 0.4 else 'WATCH' if score >= 0.25 else 'IGNORE',
        'change_pct': round(float(row.get('change_pct', 0.0)), 2),
        'daily_rsi': round(rsi, 2),
        'weekly_rsi': round(w_rsi, 2),
        'monthly_rsi': round(m_rsi, 2),
        'ema20': round(ema20, 2),
        'ema50': round(ema50, 2),
        'ema100': round(ema100, 2),
        'ema200': round(ema200, 2),
        'support': round(support, 2),
        'resistance': round(resistance, 2),
        'macd': round(macd, 4),
        'macd_signal': round(macd_sig, 4),
        'volume_ratio': round(vol_ratio, 2),
        'super_signal': super_sig,
        'reasons': reasons,
        'sparkline': row.get('sparkline', ''),
    }


def _reversal_flags(row: dict) -> tuple[bool, bool, list[str]]:
    reasons = []
    weak_count = 0

    if row.get('macd', 0.0) < row.get('macd_signal', 0.0):
        weak_count += 1
        reasons.append('MACD bearish crossover')

    if row.get('ema20', 0.0) < row.get('ema50', 0.0):
        weak_count += 1
        reasons.append('EMA20 crossed below EMA50')

    if 'SELL' in str(row.get('super_signal', '')):
        weak_count += 1
        reasons.append('Supertrend turned bearish')

    return weak_count >= 1, weak_count >= 2, reasons
