from __future__ import annotations

from app.config import get_settings
from app.db import SessionLocal, TradeLog, get_state
from app.models import TradeRequest, TradeResponse


class TradeEngine:
    def __init__(self, angel_client):
        self.angel_client = angel_client
        self.settings = get_settings()

    def current_mode(self) -> str:
        with SessionLocal() as session:
            return get_state(session, 'trade_mode', self.settings.default_mode)

    def execute(self, req: TradeRequest) -> TradeResponse:
        mode = self.current_mode()

        if req.quantity > self.settings.max_order_qty:
            return TradeResponse(
                status='blocked',
                message=f'Quantity {req.quantity} exceeds MAX_ORDER_QTY ({self.settings.max_order_qty}).',
            )

        with SessionLocal() as session:
            count_today = session.query(TradeLog).filter(TradeLog.status.in_(['executed', 'paper'])).count()
            if count_today >= self.settings.max_daily_trades:
                return TradeResponse(
                    status='blocked',
                    message='Daily trade limit reached.',
                )

        if mode != 'live' or not self.settings.allow_live_trades:
            self._log(req, mode='paper', status='paper', note='Paper mode or live disabled.')
            return TradeResponse(status='paper', message='Paper trade simulated. No live order sent.')

        if not self.angel_client.is_connected():
            ok, msg = self.angel_client.connect()
            if not ok:
                return TradeResponse(status='failed', message=f'Broker connection failed: {msg}')

        payload = {
            'variety': req.variety,
            'tradingsymbol': req.symbol,
            'symboltoken': req.symbol_token,
            'transactiontype': req.transaction_type,
            'exchange': req.exchange,
            'ordertype': req.order_type,
            'producttype': req.product_type,
            'duration': req.duration,
            'price': str(req.price),
            'squareoff': '0',
            'stoploss': '0',
            'quantity': str(req.quantity),
        }
        result = self.angel_client.place_order(payload)
        if result.get('ok'):
            oid = result.get('order_id')
            self._log(req, mode='live', status='executed', order_id=oid)
            return TradeResponse(status='executed', message='Live order placed.', order_id=oid)

        error = result.get('error', 'Unknown order error')
        self._log(req, mode='live', status='failed', note=error)
        return TradeResponse(status='failed', message=error)

    def _log(self, req: TradeRequest, mode: str, status: str, order_id: str | None = None, note: str | None = None) -> None:
        with SessionLocal() as session:
            row = TradeLog(
                symbol=req.symbol,
                action=req.transaction_type,
                quantity=req.quantity,
                mode=mode,
                status=status,
                order_id=order_id,
                note=note,
            )
            session.add(row)
            session.commit()
