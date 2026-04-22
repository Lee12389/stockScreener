"""Dashboard performer ranking and suggestion helpers."""

from datetime import datetime

from app.config import get_settings
from app.models import Performer, Suggestion, SuggestionResponse


class AnalysisService:
    """Builds simple performer and suggestion views from broker data."""

    def __init__(self, angel_client):
        """Stores the broker client and app thresholds used for analysis."""
        self.angel_client = angel_client
        self.settings = get_settings()

    def top_performers(self) -> list[Performer]:
        """Returns top performers for the configured default watchlist."""
        return self.top_performers_from_symbols(self.settings.watchlist_symbols)

    def top_performers_from_symbols(self, symbols: list[str]) -> list[Performer]:
        """Fetches and normalizes top performers for an explicit symbol set."""
        rows = self.angel_client.fetch_top_performers(
            top_n=self.settings.top_n,
            watchlist_symbols=symbols,
        )
        return [
            Performer(
                symbol=row.get('symbol', ''),
                last_price=row.get('last_price'),
                change_pct=row.get('change_pct'),
            )
            for row in rows
            if row.get('symbol')
        ]

    def suggestions(self, performers: list[Performer]) -> SuggestionResponse:
        """Converts performer momentum into BUY, SELL, or HOLD suggestions."""
        suggestions: list[Suggestion] = []
        for p in performers:
            change = p.change_pct if p.change_pct is not None else 0.0
            if change >= self.settings.buy_threshold:
                action = 'BUY'
                confidence = min(0.9, 0.5 + (change / 10.0))
                reason = f'Momentum is positive ({change:.2f}%).'
            elif change <= self.settings.sell_threshold:
                action = 'SELL'
                confidence = min(0.9, 0.5 + (abs(change) / 10.0))
                reason = f'Momentum is negative ({change:.2f}%).'
            else:
                action = 'HOLD'
                confidence = 0.55
                reason = 'Movement is within neutral band.'

            suggestions.append(
                Suggestion(
                    symbol=p.symbol,
                    action=action,
                    confidence=round(confidence, 2),
                    reason=reason,
                )
            )

        return SuggestionResponse(generated_at=datetime.utcnow(), suggestions=suggestions)
