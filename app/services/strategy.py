from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
import yfinance as yf


@dataclass
class StrategyHit:
    symbol: str
    monthly_rsi: float
    weekly_rsi: float
    daily_rsi: float
    triggers: list[str]
    note: str


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    if isinstance(series, pd.DataFrame):
        series = series.iloc[:, 0]
    series = pd.to_numeric(series, errors='coerce').dropna()
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    return pd.to_numeric(rsi, errors='coerce').fillna(50.0)


class StrategyService:
    def scan_rsa_flow(self, symbols: list[str]) -> list[StrategyHit]:
        hits: list[StrategyHit] = []

        for symbol in symbols:
            try:
                hist = yf.download(symbol, period='2y', interval='1d', auto_adjust=True, progress=False)
            except Exception:
                continue

            if hist.empty:
                continue

            if 'Close' in hist.columns:
                close_data = hist['Close']
            elif isinstance(hist.columns, pd.MultiIndex) and 'Close' in hist.columns.get_level_values(0):
                close_data = hist['Close']
            else:
                continue

            if isinstance(close_data, pd.DataFrame):
                close = close_data.iloc[:, 0].dropna()
            else:
                close = close_data.dropna()

            if len(close) < 100:
                continue

            daily_rsi_series = _rsi(close)
            weekly_rsi_series = _rsi(close.resample('W-FRI').last().dropna())
            monthly_rsi_series = _rsi(close.resample('ME').last().dropna())

            if daily_rsi_series.empty or weekly_rsi_series.empty or monthly_rsi_series.empty:
                continue

            daily = float(daily_rsi_series.iloc[-1])
            prev_daily = float(daily_rsi_series.iloc[-2]) if len(daily_rsi_series) > 1 else daily
            weekly = float(weekly_rsi_series.iloc[-1])
            monthly = float(monthly_rsi_series.iloc[-1])

            if monthly <= 60 or weekly <= 60:
                continue

            tail10 = daily_rsi_series.tail(10)
            tail20 = daily_rsi_series.tail(20)

            cross_40 = prev_daily < 40 <= daily
            cross_60 = prev_daily < 60 <= daily
            bounce_40 = (tail10.min() < 40) and (daily > 40) and (daily >= prev_daily)
            bounce_60 = (tail20.min() < 60) and (daily > 60) and (daily >= prev_daily)

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

            note = 'Monthly/Weekly strength confirmed; Daily RSI trigger active.'
            hits.append(
                StrategyHit(
                    symbol=symbol,
                    monthly_rsi=round(monthly, 2),
                    weekly_rsi=round(weekly, 2),
                    daily_rsi=round(daily, 2),
                    triggers=triggers,
                    note=note,
                )
            )

        hits.sort(key=lambda x: (len(x.triggers), x.daily_rsi), reverse=True)
        return hits
