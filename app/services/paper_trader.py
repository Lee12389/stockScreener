from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import PaperAccount, PaperPosition, PaperTrade, SessionLocal


class PaperTraderService:
    def __init__(self, strategy_service):
        self.strategy_service = strategy_service
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()

    def reset_account(self, starting_cash: float) -> dict:
        with SessionLocal() as session:
            account = session.get(PaperAccount, 1)
            if account is None:
                account = PaperAccount(id=1, starting_cash=starting_cash, cash_balance=starting_cash, realized_pnl=0.0)
                session.add(account)
            else:
                account.starting_cash = starting_cash
                account.cash_balance = starting_cash
                account.realized_pnl = 0.0
                account.updated_at = datetime.utcnow()

            session.query(PaperPosition).delete()
            session.query(PaperTrade).delete()
            session.commit()

        return self.summary()

    def summary(self) -> dict:
        with SessionLocal() as session:
            account = session.get(PaperAccount, 1)
            if account is None:
                account = PaperAccount(id=1, starting_cash=100000.0, cash_balance=100000.0, realized_pnl=0.0)
                session.add(account)
                session.commit()

            positions = session.query(PaperPosition).all()
            trades = session.query(PaperTrade).order_by(PaperTrade.created_at.desc()).limit(100).all()

            mark = self._latest_price_map()
            open_value = 0.0
            pos_rows = []
            for p in positions:
                ltp = mark.get(p.symbol, p.avg_price)
                pnl = (ltp - p.avg_price) * p.quantity
                open_value += ltp * p.quantity
                pos_rows.append(
                    {
                        'symbol': p.symbol,
                        'exchange': p.exchange,
                        'quantity': p.quantity,
                        'avg_price': round(p.avg_price, 2),
                        'ltp': round(ltp, 2),
                        'unrealized_pnl': round(pnl, 2),
                        'strategy': p.strategy,
                    }
                )

            equity = account.cash_balance + open_value
            total_pnl = account.realized_pnl + sum(r['unrealized_pnl'] for r in pos_rows)

            return {
                'starting_cash': round(account.starting_cash, 2),
                'cash_balance': round(account.cash_balance, 2),
                'equity': round(equity, 2),
                'realized_pnl': round(account.realized_pnl, 2),
                'total_pnl': round(total_pnl, 2),
                'positions': pos_rows,
                'trades': [
                    {
                        'time': t.created_at.isoformat(),
                        'symbol': t.symbol,
                        'side': t.side,
                        'quantity': t.quantity,
                        'price': round(t.price, 2),
                        'value': round(t.value, 2),
                        'realized_pnl': round(t.realized_pnl, 2),
                        'strategy': t.strategy,
                        'signal': t.signal,
                        'note': t.note,
                        'balance_after': round(t.balance_after, 2),
                    }
                    for t in trades
                ],
            }

    def manual_trade(self, symbol: str, strategy: str, action: str = 'AUTO', amount: float = 0.0, refresh_signals: bool = False) -> dict:
        candidates = self._strategy_rows(strategy, refresh_signals)
        row = next((r for r in candidates if r.get('symbol') == symbol), None)
        if row is None:
            return {'ok': False, 'message': f'Symbol {symbol} not found in strategy candidates.'}

        side = action.upper()
        if side == 'AUTO':
            sig = str(row.get('signal', 'HOLD')).upper()
            if 'SELL' in sig:
                side = 'SELL'
            elif 'BUY' in sig:
                side = 'BUY'
            else:
                return {'ok': False, 'message': f'No actionable signal for {symbol}.'}

        strength = _signal_strength(str(row.get('signal', 'HOLD')))
        price = self._entry_price(row)
        with SessionLocal() as session:
            account = session.get(PaperAccount, 1)
            if account is None:
                account = PaperAccount(id=1, starting_cash=100000.0, cash_balance=100000.0, realized_pnl=0.0)
                session.add(account)
                session.commit()

            trades_left = 10
            qty = self._optimize_quantity(account.cash_balance, price, strength, trades_left, amount)
            if qty <= 0:
                return {'ok': False, 'message': 'Insufficient cash for this paper trade.'}

            result = self._execute(session, account, row, side, qty, strategy)
            session.commit()
            return {'ok': True, 'message': 'Paper trade executed.', 'trade': result, 'summary': self.summary()}

    def start_auto(self, strategy: str, interval_minutes: int, max_trades_per_cycle: int, refresh_signals: bool = True) -> None:
        self.scheduler.remove_all_jobs()
        self.scheduler.add_job(
            self._auto_cycle,
            'interval',
            minutes=interval_minutes,
            kwargs={
                'strategy': strategy,
                'max_trades_per_cycle': max_trades_per_cycle,
                'refresh_signals': refresh_signals,
            },
            id='paper_auto',
            replace_existing=True,
        )

    def stop_auto(self) -> None:
        self.scheduler.remove_all_jobs()

    def _auto_cycle(self, strategy: str, max_trades_per_cycle: int, refresh_signals: bool) -> None:
        rows = self._strategy_rows(strategy, refresh_signals)
        if not rows:
            return

        actionable = [r for r in rows if 'BUY' in str(r.get('signal', '')) or 'SELL' in str(r.get('signal', ''))]
        actionable.sort(key=lambda r: (_signal_strength(str(r.get('signal', 'HOLD'))), r.get('change_pct', 0.0)), reverse=True)
        picks = actionable[:max_trades_per_cycle]

        with SessionLocal() as session:
            account = session.get(PaperAccount, 1)
            if account is None:
                account = PaperAccount(id=1, starting_cash=100000.0, cash_balance=100000.0, realized_pnl=0.0)
                session.add(account)
                session.commit()

            for idx, row in enumerate(picks, start=1):
                signal = str(row.get('signal', 'HOLD'))
                side = 'SELL' if 'SELL' in signal else 'BUY'
                strength = _signal_strength(signal)
                price = self._entry_price(row)
                qty = self._optimize_quantity(account.cash_balance, price, strength, max_trades_per_cycle - idx + 1, 0.0)
                if qty <= 0:
                    continue
                self._execute(session, account, row, side, qty, strategy)

            session.commit()

    def _strategy_rows(self, strategy: str, refresh_signals: bool) -> list[dict]:
        strategy = strategy.lower().strip()
        if strategy == 'supertrend':
            hits, _ = self.strategy_service.scan_supertrend(force_refresh=refresh_signals)
            return [
                {
                    'symbol': h.symbol,
                    'signal': h.signal,
                    'change_pct': h.change_pct,
                    'support': h.support,
                    'resistance': h.resistance,
                    'close': h.close,
                    'stop_loss': h.support,
                    'targets': [h.resistance],
                }
                for h in hits
            ]
        if strategy == 'merged':
            hits, _ = self.strategy_service.scan_merged(force_refresh=refresh_signals)
            return [
                {
                    'symbol': h.symbol,
                    'signal': h.signal,
                    'change_pct': h.change_pct,
                    'support': h.support,
                    'resistance': h.resistance,
                    'close': h.support if h.support > 0 else h.resistance,
                    'stop_loss': h.stop_loss,
                    'targets': h.targets,
                }
                for h in hits
            ]
        hits, _ = self.strategy_service.scan_rsa_flow(force_refresh=refresh_signals)
        return [
            {
                'symbol': h.symbol,
                'signal': h.action,
                'change_pct': h.change_pct,
                'close': h.stop_loss,
                'stop_loss': h.stop_loss,
                'targets': h.targets,
            }
            for h in hits
        ]

    def _entry_price(self, row: dict) -> float:
        if row.get('close') and row.get('close') > 0:
            return float(row['close'])
        if row.get('support') and row.get('support') > 0:
            return float(row['support'])
        if row.get('resistance') and row.get('resistance') > 0:
            return float(row['resistance'])
        return 1.0

    def _optimize_quantity(self, cash: float, price: float, strength: float, trades_left: int, amount_override: float) -> int:
        if price <= 0:
            return 0

        base_pct = 0.06 + (0.24 * max(0.0, min(strength, 1.0)))
        cycle_factor = min(1.0, max(0.2, trades_left / 5.0))
        allocation = cash * base_pct * cycle_factor
        if amount_override and amount_override > 0:
            allocation = min(allocation, amount_override)

        qty = int(allocation // price)
        affordable = int(cash // price)
        return max(0, min(qty, affordable))

    def _execute(self, session, account: PaperAccount, row: dict, side: str, qty: int, strategy: str) -> dict:
        symbol = row.get('symbol')
        price = self._entry_price(row)
        value = qty * price
        position = session.get(PaperPosition, symbol)
        realized = 0.0

        if side == 'BUY':
            if account.cash_balance < value:
                return {'symbol': symbol, 'status': 'skipped_cash'}
            account.cash_balance -= value
            if position is None:
                position = PaperPosition(symbol=symbol, exchange='NSE', quantity=qty, avg_price=price, strategy=strategy)
                session.add(position)
            else:
                new_qty = position.quantity + qty
                position.avg_price = ((position.avg_price * position.quantity) + value) / max(new_qty, 1)
                position.quantity = new_qty
                position.strategy = strategy
                position.updated_at = datetime.utcnow()
        else:
            if position is None or position.quantity <= 0:
                return {'symbol': symbol, 'status': 'skipped_no_position'}
            sell_qty = min(qty, position.quantity)
            value = sell_qty * price
            account.cash_balance += value
            realized = (price - position.avg_price) * sell_qty
            account.realized_pnl += realized
            position.quantity -= sell_qty
            position.updated_at = datetime.utcnow()
            if position.quantity <= 0:
                session.delete(position)
            qty = sell_qty

        account.updated_at = datetime.utcnow()

        trade = PaperTrade(
            symbol=symbol,
            exchange='NSE',
            side=side,
            quantity=qty,
            price=price,
            value=value,
            realized_pnl=realized,
            strategy=strategy,
            signal=str(row.get('signal', 'NA')),
            note=f"SL:{row.get('stop_loss')} TG:{row.get('targets')}",
            balance_after=account.cash_balance,
        )
        session.add(trade)
        return {
            'symbol': symbol,
            'side': side,
            'qty': qty,
            'price': round(price, 2),
            'value': round(value, 2),
            'realized_pnl': round(realized, 2),
        }

    def _latest_price_map(self) -> dict[str, float]:
        merged, err = self.strategy_service.scan_merged(force_refresh=False)
        if err:
            return {}
        out: dict[str, float] = {}
        for row in merged:
            if row.support and row.resistance:
                out[row.symbol] = (row.support + row.resistance) / 2.0
        return out


def _signal_strength(signal: str) -> float:
    s = signal.upper().strip()
    if s == 'STRONG_BUY' or s == 'STRONG_SELL':
        return 0.95
    if s == 'BUY' or s == 'SELL':
        return 0.75
    return 0.2
