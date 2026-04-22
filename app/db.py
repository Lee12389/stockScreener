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


class PaperAccount(Base):
    __tablename__ = 'paper_account'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    starting_cash: Mapped[float] = mapped_column(Float, nullable=False, default=100000.0)
    cash_balance: Mapped[float] = mapped_column(Float, nullable=False, default=100000.0)
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PaperPosition(Base):
    __tablename__ = 'paper_positions'

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    exchange: Mapped[str] = mapped_column(String(16), nullable=False, default='NSE')
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    strategy: Mapped[str] = mapped_column(String(32), nullable=False, default='manual')
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PaperTrade(Base):
    __tablename__ = 'paper_trades'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    exchange: Mapped[str] = mapped_column(String(16), nullable=False, default='NSE')
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    strategy: Mapped[str] = mapped_column(String(32), nullable=False, default='manual')
    signal: Mapped[str] = mapped_column(String(32), nullable=False, default='NA')
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    balance_after: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class StrategyBot(Base):
    __tablename__ = 'strategy_bots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    strategy: Mapped[str] = mapped_column(String(64), nullable=False)
    starting_capital: Mapped[float] = mapped_column(Float, nullable=False, default=1000000.0)
    cash_balance: Mapped[float] = mapped_column(Float, nullable=False, default=1000000.0)
    equity: Mapped[float] = mapped_column(Float, nullable=False, default=1000000.0)
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_drawdown_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    trades_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wins_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    losses_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='idle')
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StrategyBotPosition(Base):
    __tablename__ = 'strategy_bot_positions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    instrument: Mapped[str] = mapped_column(String(16), nullable=False)  # EQ/FUT/OPT
    side: Mapped[str] = mapped_column(String(8), nullable=False)  # BUY/SELL
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    stop_loss: Mapped[float] = mapped_column(Float, nullable=False)
    target_1: Mapped[float] = mapped_column(Float, nullable=False)
    target_2: Mapped[float] = mapped_column(Float, nullable=False)
    reserved_margin: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    signal_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    strategy_signal: Mapped[str] = mapped_column(String(64), nullable=False, default='NA')
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StrategyBotTrade(Base):
    __tablename__ = 'strategy_bot_trades'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bot_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    instrument: Mapped[str] = mapped_column(String(16), nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    win: Mapped[str] = mapped_column(String(5), nullable=False, default='false')
    reason: Mapped[str] = mapped_column(String(128), nullable=False, default='signal_flip')
    signal_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)


class BoughtMonitor(Base):
    __tablename__ = 'bought_monitor'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    exchange: Mapped[str] = mapped_column(String(16), nullable=False, default='NSE')
    entry_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ScannerConfig(Base):
    __tablename__ = 'scanner_config'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    include_nifty50: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    include_midcap150: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    include_nifty500: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    scan_interval: Mapped[str] = mapped_column(String(16), nullable=False, default='FIFTEEN_MINUTE')
    use_weekly_monthly: Mapped[str] = mapped_column(String(5), nullable=False, default='false')
    volume_multiplier: Mapped[float] = mapped_column(Float, nullable=False, default=1.5)
    macd_fast: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    macd_slow: Mapped[int] = mapped_column(Integer, nullable=False, default=26)
    macd_signal: Mapped[int] = mapped_column(Integer, nullable=False, default=9)
    show_ema: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    show_rsi: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    show_macd: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    show_supertrend: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    show_volume: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    show_sr: Mapped[str] = mapped_column(String(5), nullable=False, default='true')
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ScanResultCache(Base):
    __tablename__ = 'scan_result_cache'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    timeframe: Mapped[str] = mapped_column(String(16), nullable=False)
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    candle_last_ts: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[str] = mapped_column(String(8000), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


_db_path = Path(__file__).resolve().parents[1] / 'autotrader.db'
_engine = create_engine(f'sqlite:///{_db_path}', future=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(_engine)
    _ensure_watchlist_schema()
    _ensure_strategy_bot_schema()
    _ensure_paper_defaults()


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


def _ensure_paper_defaults() -> None:
    with _engine.begin() as conn:
        exists = conn.execute(text("SELECT id FROM paper_account WHERE id = 1")).fetchone()
        if not exists:
            conn.execute(
                text(
                    "INSERT INTO paper_account (id, starting_cash, cash_balance, realized_pnl, updated_at) "
                    "VALUES (1, 100000.0, 100000.0, 0.0, CURRENT_TIMESTAMP)"
                )
            )
        sc = conn.execute(text("SELECT id FROM scanner_config WHERE id = 1")).fetchone()
        if not sc:
            conn.execute(
                text(
                    "INSERT INTO scanner_config (id, include_nifty50, include_midcap150, include_nifty500, scan_interval, "
                    "use_weekly_monthly, volume_multiplier, macd_fast, macd_slow, macd_signal, "
                    "show_ema, show_rsi, show_macd, show_supertrend, show_volume, show_sr, updated_at) "
                    "VALUES (1,'true','true','true','FIFTEEN_MINUTE','false',1.5,12,26,9,"
                    "'true','true','true','true','true','true',CURRENT_TIMESTAMP)"
                )
            )


def _ensure_strategy_bot_schema() -> None:
    with _engine.begin() as conn:
        cols = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(strategy_bot_positions)")).fetchall()
        }
        if not cols:
            return
        if 'reserved_margin' not in cols:
            conn.execute(text("ALTER TABLE strategy_bot_positions ADD COLUMN reserved_margin FLOAT DEFAULT 0.0"))
        if 'signal_score' not in cols:
            conn.execute(text("ALTER TABLE strategy_bot_positions ADD COLUMN signal_score FLOAT DEFAULT 0.0"))
