from __future__ import annotations

from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, Float, Integer, String, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class TradeLog(Base):
    __tablename__ = 'trade_logs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(8), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    order_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class AppState(Base):
    __tablename__ = 'app_state'

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(256), nullable=False)


class AnalysisSnapshot(Base):
    __tablename__ = 'analysis_snapshots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    change_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    suggestion: Mapped[str] = mapped_column(String(8), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)


class WatchlistItem(Base):
    __tablename__ = 'watchlist_items'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    exchange: Mapped[str] = mapped_column(String(16), nullable=False, default='NSE')
    symbol_token: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sector: Mapped[str] = mapped_column(String(64), nullable=False, default='Custom')
    source: Mapped[str] = mapped_column(String(64), nullable=False, default='manual')
    enabled: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


_db_path = Path(__file__).resolve().parents[1] / 'autotrader.db'
_engine = create_engine(f'sqlite:///{_db_path}', future=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(_engine)
    _ensure_watchlist_schema()


def get_state(session, key: str, default: str) -> str:
    row = session.get(AppState, key)
    if row is None:
        row = AppState(key=key, value=default)
        session.add(row)
        session.commit()
        return default
    return row.value


def set_state(session, key: str, value: str) -> None:
    row = session.get(AppState, key)
    if row is None:
        row = AppState(key=key, value=value)
        session.add(row)
    else:
        row.value = value
    session.commit()


def _ensure_watchlist_schema() -> None:
    # Lightweight migration for existing local DBs without Alembic.
    with _engine.begin() as conn:
        cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(watchlist_items)")).fetchall()
        }
        if not cols:
            return
        if 'exchange' not in cols:
            conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN exchange VARCHAR(16) DEFAULT 'NSE'"))
        if 'symbol_token' not in cols:
            conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN symbol_token VARCHAR(32)"))
