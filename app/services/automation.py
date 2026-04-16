from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import AnalysisSnapshot, SessionLocal
from app.models import TradeRequest


class AutomationService:
    def __init__(self, analysis_service, trade_engine):
        self.analysis_service = analysis_service
        self.trade_engine = trade_engine
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()

    def start(self, interval_minutes: int, auto_trade: bool) -> None:
        self.scheduler.remove_all_jobs()
        self.scheduler.add_job(
            self._run_cycle,
            'interval',
            minutes=interval_minutes,
            kwargs={'auto_trade': auto_trade},
            id='analysis_cycle',
            replace_existing=True,
        )

    def stop(self) -> None:
        self.scheduler.remove_all_jobs()

    def _run_cycle(self, auto_trade: bool) -> None:
        performers = self.analysis_service.top_performers()
        suggestion_bundle = self.analysis_service.suggestions(performers)

        with SessionLocal() as session:
            for sug in suggestion_bundle.suggestions:
                session.add(
                    AnalysisSnapshot(
                        symbol=sug.symbol,
                        change_pct=next((p.change_pct for p in performers if p.symbol == sug.symbol), None),
                        suggestion=sug.action,
                        confidence=sug.confidence,
                        reason=sug.reason,
                    )
                )
            session.commit()

        if not auto_trade:
            return

        # Conservative auto-execution: only high-confidence BUY/SELL signals.
        for sug in suggestion_bundle.suggestions:
            if sug.action == 'HOLD' or sug.confidence < 0.7:
                continue
            request = TradeRequest(
                symbol=sug.symbol,
                symbol_token='',
                transaction_type=sug.action,
                quantity=1,
            )
            self.trade_engine.execute(request)
