"""Pydantic request and response models used by the FastAPI app."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SessionStatus(BaseModel):
    """Reports whether the broker session is connected."""

    connected: bool
    message: str


class Performer(BaseModel):
    """Represents a ranked market mover used by the dashboard."""

    symbol: str
    last_price: Optional[float] = None
    change_pct: Optional[float] = None


class Suggestion(BaseModel):
    """Represents a simple trade suggestion derived from momentum."""

    symbol: str
    action: Literal['BUY', 'SELL', 'HOLD']
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class SuggestionResponse(BaseModel):
    """Bundles generated suggestions with their generation timestamp."""

    generated_at: datetime
    suggestions: list[Suggestion]


class TradeRequest(BaseModel):
    """Defines the payload required to submit a trade."""

    symbol: str
    symbol_token: str
    exchange: str = 'NSE'
    transaction_type: Literal['BUY', 'SELL']
    order_type: str = 'MARKET'
    product_type: str = 'INTRADAY'
    quantity: int = 1
    price: float = 0.0
    variety: str = 'NORMAL'
    duration: str = 'DAY'


class TradeResponse(BaseModel):
    """Captures the result of a live or paper trade attempt."""

    status: Literal['executed', 'paper', 'blocked', 'failed']
    message: str
    order_id: Optional[str] = None


class AutomationRequest(BaseModel):
    """Configures the lightweight analysis automation scheduler."""

    interval_minutes: int = Field(default=5, ge=1, le=120)
    auto_trade: bool = False


class PaperTradeRequest(BaseModel):
    """Requests a manual or AUTO-driven paper trade."""

    symbol: str
    strategy: Literal['rsi', 'supertrend', 'merged'] = 'merged'
    action: Literal['AUTO', 'BUY', 'SELL'] = 'AUTO'
    amount: float = Field(default=0.0, ge=0.0)
    refresh_signals: bool = False


class PaperBotRequest(BaseModel):
    """Configures the interval-based paper trading bot."""

    strategy: Literal['rsi', 'supertrend', 'merged'] = 'merged'
    interval_minutes: int = Field(default=15, ge=1, le=240)
    max_trades_per_cycle: int = Field(default=3, ge=1, le=20)
    refresh_signals: bool = True


class PaperFundRequest(BaseModel):
    """Resets the paper account to a new starting balance."""

    starting_cash: float = Field(default=100000.0, ge=1000.0)


class TournamentInitRequest(BaseModel):
    """Seeds tournament bots with fresh starting capital."""

    starting_capital: float = Field(default=1000000.0, ge=100000.0)


class TournamentStartRequest(BaseModel):
    """Starts scheduled tournament execution."""

    interval_seconds: int = Field(default=60, ge=10, le=3600)
    refresh_signals: bool = True


class TournamentRunRequest(BaseModel):
    """Controls a single tournament execution cycle."""

    refresh_signals: bool = True


class ScannerConfigRequest(BaseModel):
    """Carries persisted scanner configuration values from the UI."""

    include_nifty50: bool = True
    include_midcap150: bool = True
    include_nifty500: bool = True
    scan_interval: Literal['FIVE_MINUTE', 'FIFTEEN_MINUTE', 'ONE_HOUR', 'ONE_DAY', 'ONE_WEEK', 'ONE_MONTH'] = 'FIFTEEN_MINUTE'
    use_weekly_monthly: bool = False
    volume_multiplier: float = Field(default=1.5, ge=0.5, le=5.0)
    macd_fast: int = Field(default=12, ge=2, le=200)
    macd_slow: int = Field(default=26, ge=3, le=300)
    macd_signal: int = Field(default=9, ge=2, le=200)
    show_ema: bool = True
    show_rsi: bool = True
    show_macd: bool = True
    show_supertrend: bool = True
    show_volume: bool = True
    show_sr: bool = True


class BoughtAddRequest(BaseModel):
    """Adds or updates a bought-monitor tracking row."""

    symbol: str
    entry_price: float = Field(ge=0.0)
    quantity: int = Field(default=1, ge=1)
    note: str = ''


class WatchlistAddRequest(BaseModel):
    """Adds a symbol to the user-managed watchlist."""

    symbol: str
    exchange: str = 'NSE'
    symbol_token: str = ''
    sector: str = 'Custom'


class WatchlistSymbolRequest(BaseModel):
    """Targets a single watchlist symbol."""

    symbol: str


class WatchlistToggleRequest(BaseModel):
    """Enables or disables a watchlist symbol."""

    symbol: str
    enabled: bool


class OptionsLabRequest(BaseModel):
    """Submits option-chain rows for canned strategy recommendations."""

    spot: float = Field(gt=0)
    capital: float = Field(gt=1000)
    option_rows_csv: str


class OptionsCustomRequest(BaseModel):
    """Submits a custom multi-leg options strategy for payoff analysis."""

    spot: float = Field(gt=0)
    capital: float = Field(gt=1000)
    option_rows_csv: str = ''
    legs_csv: str
    lot_size: int = Field(default=50, ge=1, le=10000)
