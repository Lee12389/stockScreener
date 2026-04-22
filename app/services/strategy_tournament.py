from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import SessionLocal, StrategyBot, StrategyBotPosition, StrategyBotTrade


STRATEGIES = [
    ('rsi_trend_pullback', 'RSI Trend Pullback'),
    ('supertrend_regime', 'Supertrend Regime'),
    ('breakout_volume', 'Breakout + Volume Expansion'),
    ('mean_reversion_vwap', 'Mean Reversion Proxy'),
    ('opening_range_proxy', 'Opening Range Proxy'),
    ('atr_vol_breakout', 'ATR Volatility Breakout'),
    ('sr_bounce_confirm', 'S/R Bounce Confirmation'),
    ('mtf_momentum', 'Multi-Timeframe Momentum'),
    ('trend_continuation', 'Trend Continuation'),
    ('ensemble_combo', 'Ensemble Combo'),
]

INSTRUMENTS = ('EQ', 'FUT', 'OPT')


class StrategyTournamentService:
    def __init__(self, strategy_service):
        self.strategy_service = strategy_service
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()

    def setup_bots(self, capital: float = 1000000.0) -> dict:
        with SessionLocal() as session:
            session.query(StrategyBotPosition).delete()
            session.query(StrategyBotTrade).delete()
            session.query(StrategyBot).delete()
            session.commit()

            for key, name in STRATEGIES:
                session.add(
                    StrategyBot(
                        name=name,
                        strategy=key,
                        starting_capital=capital,
                        cash_balance=capital,
                        equity=capital,
                        realized_pnl=0.0,
                        status='idle',
                        updated_at=datetime.utcnow(),
                    )
                )
            session.commit()

        return self.leaderboard()

    def run_once(self, refresh_signals: bool = True) -> dict:
        market, err = self.strategy_service.get_market_snapshot(force_refresh=refresh_signals)
        if err:
            return {'ok': False, 'message': err}

        with SessionLocal() as session:
            bots = session.query(StrategyBot).all()
            for bot in bots:
                bot.status = 'running'
                self._mark_to_market(session, bot, market)
                self._process_bot(session, bot, market)
                session.flush()
                self._mark_to_market(session, bot, market)
                bot.last_run_at = datetime.utcnow()
                bot.updated_at = datetime.utcnow()
                bot.status = 'idle'
            session.commit()

        return {'ok': True, 'leaderboard': self.leaderboard()}

    def start(self, interval_seconds: int = 60, refresh_signals: bool = True) -> None:
        self.scheduler.remove_all_jobs()
        self.scheduler.add_job(
            self.run_once,
            'interval',
            seconds=max(10, interval_seconds),
            kwargs={'refresh_signals': refresh_signals},
            id='strategy_tournament',
            replace_existing=True,
        )

    def stop(self) -> None:
        self.scheduler.remove_all_jobs()

    def leaderboard(self) -> dict:
        jobs = self.scheduler.get_jobs()
        with SessionLocal() as session:
            bots = session.query(StrategyBot).all()
            rows = []
            for b in bots:
                win_rate = (b.wins_count / b.trades_count * 100.0) if b.trades_count else 0.0
                rows.append(
                    {
                        'bot_id': b.id,
                        'name': b.name,
                        'strategy': b.strategy,
                        'starting_capital': round(b.starting_capital, 2),
                        'cash_balance': round(b.cash_balance, 2),
                        'equity': round(b.equity, 2),
                        'realized_pnl': round(b.realized_pnl, 2),
                        'return_pct': round(((b.equity - b.starting_capital) / b.starting_capital) * 100.0, 2),
                        'trades_count': b.trades_count,
                        'wins_count': b.wins_count,
                        'losses_count': b.losses_count,
                        'win_rate_pct': round(win_rate, 2),
                        'max_drawdown_pct': round(b.max_drawdown_pct, 2),
                        'status': b.status,
                        'last_run_at': b.last_run_at.isoformat() if b.last_run_at else None,
                    }
                )

            rows.sort(key=lambda x: (x['equity'], x['win_rate_pct']), reverse=True)

            recent = session.query(StrategyBotTrade).order_by(StrategyBotTrade.created_at.desc()).limit(200).all()
            recent_rows = [
                {
                    'time': t.created_at.isoformat(),
                    'bot_id': t.bot_id,
                    'symbol': t.symbol,
                    'instrument': t.instrument,
                    'side': t.side,
                    'qty': t.quantity,
                    'entry': round(t.entry_price, 2),
                    'exit': round(t.exit_price, 2),
                    'pnl': round(t.pnl, 2),
                    'win': t.win,
                    'reason': t.reason,
                    'signal_score': round(t.signal_score, 3),
                }
                for t in recent
            ]

            return {
                'running': any(job.id == 'strategy_tournament' for job in jobs),
                'jobs': [job.id for job in jobs],
                'bots': rows,
                'recent_trades': recent_rows,
            }

    def _process_bot(self, session, bot: StrategyBot, market: dict[str, dict]) -> None:
        positions = session.query(StrategyBotPosition).filter(StrategyBotPosition.bot_id == bot.id).all()

        # Manage exits first.
        for p in positions:
            row = market.get(p.symbol)
            if row is None:
                continue
            current = _instrument_mark_price(row, p.instrument, p.side)
            score = _strategy_score(bot.strategy, row)
            close_reason = None

            if p.side == 'BUY':
                if current <= p.stop_loss:
                    close_reason = 'stop_loss'
                elif current >= p.target_2:
                    close_reason = 'target_2'
                elif score < -0.35:
                    close_reason = 'signal_flip'
            else:
                if current >= p.stop_loss:
                    close_reason = 'stop_loss'
                elif current <= p.target_2:
                    close_reason = 'target_2'
                elif score > 0.35:
                    close_reason = 'signal_flip'

            if close_reason:
                self._close_position(session, bot, p, current, close_reason)
        session.flush()
        live_positions = session.query(StrategyBotPosition).filter(StrategyBotPosition.bot_id == bot.id).all()
        reserved_now = sum(p.reserved_margin for p in live_positions)

        # New entries per symbol/instrument.
        for symbol, row in market.items():
            if len(live_positions) >= 12:
                break
            if reserved_now >= (bot.equity * 0.70):
                break

            score = _strategy_score(bot.strategy, row)
            if abs(score) < 0.35:
                continue

            for instrument in INSTRUMENTS:
                existing = next((p for p in live_positions if p.symbol == symbol and p.instrument == instrument), None)
                if existing:
                    continue

                side = 'BUY' if score > 0 else 'SELL'
                entry = _instrument_mark_price(row, instrument, side)
                sl, t1, t2 = _entry_levels(row, entry, side)
                qty, reserve = _optimize_qty(bot, entry, sl, instrument, abs(score), trades_left=5)
                if qty <= 0 or reserve > bot.cash_balance:
                    continue
                if (reserved_now + reserve) >= (bot.equity * 0.70):
                    continue

                bot.cash_balance -= reserve
                pos = StrategyBotPosition(
                    bot_id=bot.id,
                    symbol=symbol,
                    instrument=instrument,
                    side=side,
                    quantity=qty,
                    entry_price=entry,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    reserved_margin=reserve,
                    signal_score=abs(score),
                    strategy_signal=f'{bot.strategy}:{score:.3f}',
                    opened_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                session.add(pos)
                live_positions.append(pos)
                reserved_now += reserve

    def _close_position(self, session, bot: StrategyBot, pos: StrategyBotPosition, exit_price: float, reason: str) -> None:
        pnl_unit = (exit_price - pos.entry_price) if pos.side == 'BUY' else (pos.entry_price - exit_price)
        pnl = pnl_unit * pos.quantity * _contract_size(pos.instrument)

        bot.cash_balance += pos.reserved_margin + pnl
        bot.realized_pnl += pnl
        bot.trades_count += 1
        if pnl >= 0:
            bot.wins_count += 1
        else:
            bot.losses_count += 1

        trade = StrategyBotTrade(
            bot_id=bot.id,
            symbol=pos.symbol,
            instrument=pos.instrument,
            side=pos.side,
            quantity=pos.quantity,
            entry_price=pos.entry_price,
            exit_price=exit_price,
            pnl=pnl,
            win='true' if pnl >= 0 else 'false',
            reason=reason,
            signal_score=pos.signal_score,
        )
        session.add(trade)
        session.delete(pos)

    def _mark_to_market(self, session, bot: StrategyBot, market: dict[str, dict]) -> None:
        positions = session.query(StrategyBotPosition).filter(StrategyBotPosition.bot_id == bot.id).all()
        unrealized = 0.0
        for p in positions:
            row = market.get(p.symbol)
            if row is None:
                continue
            mark = _instrument_mark_price(row, p.instrument, p.side)
            pnl_unit = (mark - p.entry_price) if p.side == 'BUY' else (p.entry_price - mark)
            unrealized += pnl_unit * p.quantity * _contract_size(p.instrument)

        bot.equity = bot.cash_balance + sum(p.reserved_margin for p in positions) + unrealized
        peak = max(bot.starting_capital, bot.equity)
        dd = ((peak - bot.equity) / peak * 100.0) if peak else 0.0
        bot.max_drawdown_pct = max(bot.max_drawdown_pct, dd)


def _strategy_score(strategy_key: str, row: dict) -> float:
    close = row.get('close', 0.0)
    ema50 = row.get('ema50', close)
    ema20 = row.get('ema20', close)
    rsi = row.get('daily_rsi', 50.0)
    super_signal = row.get('super_signal', 'HOLD')
    change = row.get('change_pct', 0.0)
    sr = row.get('sr_proximity', 0.0)
    vol = row.get('volume_weight', 1.0)

    trend = 1.0 if close >= ema50 else -1.0
    rsi_bias = (rsi - 50.0) / 50.0
    super_bias = 1.0 if 'BUY' in super_signal else (-1.0 if 'SELL' in super_signal else 0.0)
    mom = max(-1.0, min(1.0, change / 3.0))
    pullback = max(-1.0, min(1.0, (ema20 - close) / max(close * 0.02, 0.01)))

    if strategy_key == 'rsi_trend_pullback':
        return (0.45 * trend) + (0.45 * rsi_bias) + (0.15 * pullback)
    if strategy_key == 'supertrend_regime':
        return (0.60 * super_bias) + (0.25 * trend) + (0.15 * mom)
    if strategy_key == 'breakout_volume':
        return (0.45 * mom) + (0.30 * trend) + (0.25 * (sr * (vol - 1.0)))
    if strategy_key == 'mean_reversion_vwap':
        return (-0.50 * mom) + (0.40 * pullback) + (0.20 * (1.0 if rsi < 40 else -0.4 if rsi > 65 else 0.0))
    if strategy_key == 'opening_range_proxy':
        return (0.40 * trend) + (0.40 * mom) + (0.20 * super_bias)
    if strategy_key == 'atr_vol_breakout':
        return (0.35 * mom) + (0.25 * trend) + (0.40 * max(-1.0, min(1.0, (vol - 1.0))))
    if strategy_key == 'sr_bounce_confirm':
        return (0.40 * trend) + (0.30 * rsi_bias) + (0.30 * (sr * (vol - 0.8)))
    if strategy_key == 'mtf_momentum':
        weekly = (row.get('weekly_rsi', 50.0) - 50.0) / 50.0
        monthly = (row.get('monthly_rsi', 50.0) - 50.0) / 50.0
        return (0.35 * rsi_bias) + (0.25 * weekly) + (0.20 * monthly) + (0.20 * trend)
    if strategy_key == 'trend_continuation':
        return (0.50 * trend) + (0.30 * mom) + (0.20 * super_bias)
    # ensemble_combo
    return (0.30 * trend) + (0.25 * rsi_bias) + (0.20 * super_bias) + (0.15 * mom) + (0.10 * (sr * (vol - 1.0)))


def _entry_levels(row: dict, entry: float, side: str) -> tuple[float, float, float]:
    support = float(row.get('support', entry * 0.98) or entry * 0.98)
    resistance = float(row.get('resistance', entry * 1.02) or entry * 1.02)
    base_risk = max(abs(entry - support), entry * 0.01)

    if side == 'BUY':
        sl = min(float(row.get('previous_day_low', support) or support), support)
        risk = max(entry - sl, base_risk)
        t1 = entry + (1.6 * risk)
        t2 = entry + (2.4 * risk)
        t2 = max(t2, resistance)
        return sl, t1, t2

    sl = max(resistance, entry + base_risk)
    risk = max(sl - entry, base_risk)
    t1 = entry - (1.6 * risk)
    t2 = entry - (2.4 * risk)
    t2 = min(t2, support)
    return sl, t1, t2


def _optimize_qty(bot: StrategyBot, entry: float, sl: float, instrument: str, strength: float, trades_left: int) -> tuple[int, float]:
    if entry <= 0:
        return 0, 0.0

    margin_factor = _margin_factor(instrument)
    contract = _contract_size(instrument)
    alloc_pct = (0.01 + (0.05 * max(0.0, min(1.0, strength)))) * min(1.0, max(0.3, trades_left / 5.0))
    alloc_cash = bot.cash_balance * alloc_pct

    risk_cash = bot.equity * 0.003
    risk_per_unit = max(abs(entry - sl), entry * 0.005) * contract
    qty_by_risk = int(max(0.0, risk_cash // max(risk_per_unit, 0.01)))

    per_lot_margin = entry * contract * margin_factor
    qty_by_cash = int(max(0.0, alloc_cash // max(per_lot_margin, 0.01)))

    qty = max(0, min(qty_by_risk, qty_by_cash))
    reserve = qty * per_lot_margin
    return qty, reserve


def _instrument_mark_price(row: dict, instrument: str, side: str) -> float:
    close = float(row.get('close', 1.0))
    if instrument == 'EQ':
        return close
    if instrument == 'FUT':
        carry = 0.002 if side == 'BUY' else -0.002
        return close * (1.0 + carry)

    # Options proxy price: small-interval synthetic premium around S/R + momentum.
    support = float(row.get('support', close * 0.98))
    resistance = float(row.get('resistance', close * 1.02))
    intrinsic = max(0.0, close - support) if side == 'BUY' else max(0.0, resistance - close)
    time_val = close * 0.012
    premium = max(2.0, (0.35 * intrinsic) + time_val)
    return premium


def _margin_factor(instrument: str) -> float:
    if instrument == 'EQ':
        return 1.0
    if instrument == 'FUT':
        return 0.2
    return 1.0


def _contract_size(instrument: str) -> int:
    if instrument == 'EQ':
        return 1
    if instrument == 'FUT':
        return 25
    return 50
