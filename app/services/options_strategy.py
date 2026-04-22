from __future__ import annotations

from dataclasses import dataclass


@dataclass
class OptionRow:
    strike: float
    call_oi: float
    put_oi: float
    call_iv: float
    put_iv: float
    call_ltp: float
    put_ltp: float
    call_volume: float
    put_volume: float


@dataclass
class OptionLeg:
    side: str
    kind: str
    strike: float
    premium: float
    quantity: int = 1


class OptionsStrategyService:
    def parse_rows(self, text: str) -> list[OptionRow]:
        rows: list[OptionRow] = []
        for line in text.splitlines():
            ln = line.strip()
            if not ln or ln.startswith('#'):
                continue
            parts = [p.strip() for p in ln.split(',')]
            if len(parts) < 9:
                continue
            try:
                rows.append(
                    OptionRow(
                        strike=float(parts[0]),
                        call_oi=float(parts[1]),
                        put_oi=float(parts[2]),
                        call_iv=float(parts[3]),
                        put_iv=float(parts[4]),
                        call_ltp=float(parts[5]),
                        put_ltp=float(parts[6]),
                        call_volume=float(parts[7]),
                        put_volume=float(parts[8]),
                    )
                )
            except ValueError:
                continue
        rows.sort(key=lambda r: r.strike)
        return rows

    def parse_legs(self, text: str) -> list[OptionLeg]:
        legs: list[OptionLeg] = []
        for line in text.splitlines():
            ln = line.strip()
            if not ln or ln.startswith('#'):
                continue
            parts = [p.strip().lower() for p in ln.split(',')]
            if len(parts) < 5:
                continue
            side = parts[0]
            kind = parts[1]
            if side not in {'buy', 'sell'} or kind not in {'call', 'put'}:
                continue
            try:
                strike = float(parts[2])
                premium = float(parts[3])
                quantity = max(1, int(float(parts[4])))
            except ValueError:
                continue
            legs.append(OptionLeg(side=side, kind=kind, strike=strike, premium=premium, quantity=quantity))
        return legs

    def recommend(self, spot: float, capital: float, rows: list[OptionRow]) -> dict:
        if not rows:
            return {'error': 'No option chain rows provided.'}

        top_call = max(rows, key=lambda r: r.call_oi)
        top_put = max(rows, key=lambda r: r.put_oi)
        resistance = top_call.strike
        support = top_put.strike

        bias = 'NEUTRAL'
        if spot > resistance:
            bias = 'BULLISH_BREAKOUT'
        elif spot < support:
            bias = 'BEARISH_BREAKDOWN'
        else:
            bias = 'RANGE'

        strategies = self._build_strategies(spot, capital, rows, bias)
        default_best = strategies[0] if strategies else None

        return {
            'spot': round(spot, 2),
            'capital': round(capital, 2),
            'bias': bias,
            'support': round(support, 2),
            'resistance': round(resistance, 2),
            'max_oi_call_strike': round(top_call.strike, 2),
            'max_oi_put_strike': round(top_put.strike, 2),
            'strategies': strategies,
            'default_best': default_best,
        }

    def custom_strategy(self, spot: float, capital: float, rows: list[OptionRow], legs: list[OptionLeg], lot_size: int = 50) -> dict:
        if not legs:
            return {'error': 'No strategy legs provided. Add at least one leg.'}

        lot = max(1, int(lot_size))
        strikes = sorted({r.strike for r in rows}) if rows else sorted({l.strike for l in legs})
        if not strikes:
            strikes = sorted({l.strike for l in legs})

        low = min(min(strikes), min(l.strike for l in legs)) * 0.9
        high = max(max(strikes), max(l.strike for l in legs)) * 1.1
        if low == high:
            low = low * 0.9
            high = high * 1.1

        points = 121
        step = (high - low) / max(points - 1, 1)

        curve = []
        max_profit = float('-inf')
        max_loss = float('inf')

        for i in range(points):
            expiry_price = low + (i * step)
            pnl = 0.0
            for leg in legs:
                intrinsic = self._intrinsic(expiry_price, leg.strike, leg.kind)
                unit = (intrinsic - leg.premium) if leg.side == 'buy' else (leg.premium - intrinsic)
                pnl += unit * leg.quantity * lot
            max_profit = max(max_profit, pnl)
            max_loss = min(max_loss, pnl)
            curve.append({'price': round(expiry_price, 2), 'pnl': round(pnl, 2)})

        max_profit_out = None if max_profit > 1e11 else round(max_profit, 2)
        max_loss_abs = abs(min(0.0, max_loss))

        breakevens = self._breakevens(curve)
        pop = self._probability_of_profit(curve)

        investment = 0.0
        margin_credit = 0.0
        for leg in legs:
            cost = leg.premium * leg.quantity * lot
            if leg.side == 'buy':
                investment += cost
            else:
                margin_credit += cost

        capital_at_risk = max(max_loss_abs, investment * 0.7)
        if max_profit_out is None:
            rr = None
        else:
            rr = round((max_profit_out / max_loss_abs), 2) if max_loss_abs > 0 else None

        return {
            'spot': round(spot, 2),
            'capital': round(capital, 2),
            'lot_size': lot,
            'legs': [
                {
                    'side': leg.side.upper(),
                    'kind': leg.kind.upper(),
                    'strike': round(leg.strike, 2),
                    'premium': round(leg.premium, 2),
                    'quantity': leg.quantity,
                }
                for leg in legs
            ],
            'max_profit': max_profit_out,
            'max_loss': round(max_loss_abs, 2),
            'risk_reward': rr,
            'probability_of_profit_pct': round(pop, 2),
            'probability_of_loss_pct': round(100.0 - pop, 2),
            'capital_at_risk': round(capital_at_risk, 2),
            'capital_at_risk_pct': round((capital_at_risk / max(capital, 1.0)) * 100.0, 2),
            'net_premium_paid': round(investment, 2),
            'net_premium_received': round(margin_credit, 2),
            'breakevens': breakevens,
            'payoff_curve': curve,
            'payoff_svg': self._payoff_svg(curve),
        }

    def _build_strategies(self, spot: float, capital: float, rows: list[OptionRow], bias: str) -> list[dict]:
        strikes = sorted([r.strike for r in rows])
        atm = min(strikes, key=lambda s: abs(s - spot))

        row_map = {r.strike: r for r in rows}

        def call_price(strike: float) -> float:
            return row_map.get(strike, row_map[atm]).call_ltp

        def put_price(strike: float) -> float:
            return row_map.get(strike, row_map[atm]).put_ltp

        def vol_weight(strike: float) -> float:
            row = row_map.get(strike, row_map[atm])
            return (row.call_volume + row.put_volume) / max(1.0, row.call_oi + row.put_oi)

        step = self._avg_step(strikes)
        k1 = atm
        k2 = self._nearest(strikes, atm + step)
        k3 = self._nearest(strikes, atm + (2 * step))
        k0 = self._nearest(strikes, atm - step)
        k_2 = self._nearest(strikes, atm - (2 * step))

        bull_debit = max(0.01, call_price(k1) - call_price(k2))
        bull_width = max(0.01, k2 - k1)
        bull_max_profit = bull_width - bull_debit
        bull_max_loss = bull_debit

        bear_debit = max(0.01, put_price(k1) - put_price(k0))
        bear_width = max(0.01, k1 - k0)
        bear_max_profit = bear_width - bear_debit
        bear_max_loss = bear_debit

        ic_credit = max(0.01, put_price(k0) - put_price(k_2) + call_price(k2) - call_price(k3))
        ic_wing = max(0.01, min(k0 - k_2, k3 - k2))
        ic_max_profit = ic_credit
        ic_max_loss = max(0.01, ic_wing - ic_credit)

        base = [
            self._package(
                'Bull Call Spread',
                capital,
                bull_max_profit,
                bull_max_loss,
                0.59 if bias == 'BULLISH_BREAKOUT' else 0.48,
                f'Buy {k1}CE, Sell {k2}CE',
                vol_weight((k1 + k2) / 2),
            ),
            self._package(
                'Bear Put Spread',
                capital,
                bear_max_profit,
                bear_max_loss,
                0.59 if bias == 'BEARISH_BREAKDOWN' else 0.48,
                f'Buy {k1}PE, Sell {k0}PE',
                vol_weight((k0 + k1) / 2),
            ),
            self._package(
                'Iron Condor',
                capital,
                ic_max_profit,
                ic_max_loss,
                0.62 if bias == 'RANGE' else 0.43,
                f'Sell {k0}PE/{k2}CE + Buy {k_2}PE/{k3}CE',
                vol_weight((k_2 + k3) / 2),
            ),
        ]

        base.sort(key=lambda s: (s['score'], s['expectancy']), reverse=True)
        return base

    @staticmethod
    def _intrinsic(expiry_price: float, strike: float, kind: str) -> float:
        if kind == 'call':
            return max(0.0, expiry_price - strike)
        return max(0.0, strike - expiry_price)

    @staticmethod
    def _package(
        name: str,
        capital: float,
        max_profit: float,
        max_loss: float,
        prob_win: float,
        legs: str,
        volume_weight: float,
    ) -> dict:
        rr = (max_profit / max_loss) if max_loss > 0 else 0.0
        expectancy = (prob_win * max_profit) - ((1 - prob_win) * max_loss)
        cap_risk_pct = (max_loss / max(capital, 1.0)) * 100.0
        score = (expectancy * 0.45) + (rr * 0.25) + ((prob_win * 100.0) * 0.2) + (volume_weight * 10.0 * 0.1)
        return {
            'name': name,
            'legs': legs,
            'max_profit': round(max_profit, 2),
            'max_loss': round(max_loss, 2),
            'risk_reward': round(rr, 2),
            'probability_of_loss_pct': round((1 - prob_win) * 100.0, 2),
            'probability_of_win_pct': round(prob_win * 100.0, 2),
            'capital_at_risk_pct': round(cap_risk_pct, 2),
            'expectancy': round(expectancy, 2),
            'volume_weight': round(volume_weight, 4),
            'score': round(score, 2),
        }

    @staticmethod
    def _breakevens(curve: list[dict]) -> list[float]:
        if len(curve) < 2:
            return []
        out: list[float] = []
        prev = curve[0]
        for cur in curve[1:]:
            if prev['pnl'] == 0:
                out.append(round(prev['price'], 2))
            elif (prev['pnl'] < 0 and cur['pnl'] > 0) or (prev['pnl'] > 0 and cur['pnl'] < 0):
                out.append(round((prev['price'] + cur['price']) / 2, 2))
            prev = cur
        uniq = []
        for be in out:
            if be not in uniq:
                uniq.append(be)
        return uniq

    @staticmethod
    def _probability_of_profit(curve: list[dict]) -> float:
        if not curve:
            return 0.0
        win = sum(1 for p in curve if p['pnl'] >= 0)
        return (win / len(curve)) * 100.0

    @staticmethod
    def _payoff_svg(curve: list[dict]) -> str:
        if not curve:
            return ''
        xs = [p['price'] for p in curve]
        ys = [p['pnl'] for p in curve]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        x_span = max(1.0, max_x - min_x)
        y_span = max(1.0, max_y - min_y)

        points = []
        for p in curve:
            x = ((p['price'] - min_x) / x_span) * 100.0
            y = 60.0 - (((p['pnl'] - min_y) / y_span) * 60.0)
            points.append(f"{x:.2f},{y:.2f}")
        return ' '.join(points)

    @staticmethod
    def _nearest(strikes: list[float], val: float) -> float:
        return min(strikes, key=lambda s: abs(s - val))

    @staticmethod
    def _avg_step(strikes: list[float]) -> float:
        if len(strikes) < 2:
            return 50.0
        diffs = [abs(strikes[i] - strikes[i - 1]) for i in range(1, len(strikes))]
        return max(1.0, sum(diffs) / len(diffs))
