from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SessionStatus(BaseModel):
    connected: bool
    message: str


class Performer(BaseModel):
    symbol: str
    last_price: Optional[float] = None
    change_pct: Optional[float] = None


class Suggestion(BaseModel):
    symbol: str
    action: Literal['BUY', 'SELL', 'HOLD']
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class SuggestionResponse(BaseModel):
    generated_at: datetime
    suggestions: list[Suggestion]


class TradeRequest(BaseModel):
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
    status: Literal['executed', 'paper', 'blocked', 'failed']
    message: str
    order_id: Optional[str] = None


class AutomationRequest(BaseModel):
    interval_minutes: int = Field(default=5, ge=1, le=120)
    auto_trade: bool = False


class PaperTradeRequest(BaseModel):
    symbol: str
    strategy: Literal['rsi', 'supertrend', 'merged'] = 'merged'
    action: Literal['AUTO', 'BUY', 'SELL'] = 'AUTO'
    amount: float = Field(default=0.0, ge=0.0)
    refresh_signals: bool = False


class PaperBotRequest(BaseModel):
    strategy: Literal['rsi', 'supertrend', 'merged'] = 'merged'
    interval_minutes: int = Field(default=15, ge=1, le=240)
    max_trades_per_cycle: int = Field(default=3, ge=1, le=20)
    refresh_signals: bool = True


class PaperFundRequest(BaseModel):
    starting_cash: float = Field(default=100000.0, ge=1000.0)
