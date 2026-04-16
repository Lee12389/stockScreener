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
