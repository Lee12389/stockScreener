from __future__ import annotations

from collections.abc import Iterable

from app.db import SessionLocal, WatchlistItem


SECTOR_TOP10 = {
    'NIFTY AUTO': ['MARUTI-EQ', 'M&M-EQ', 'TATAMOTORS-EQ', 'BAJAJ-AUTO-EQ', 'EICHERMOT-EQ', 'HEROMOTOCO-EQ', 'TVSMOTOR-EQ', 'ASHOKLEY-EQ', 'BALKRISIND-EQ', 'BHARATFORG-EQ'],
    'NIFTY BANK': ['HDFCBANK-EQ', 'ICICIBANK-EQ', 'KOTAKBANK-EQ', 'SBIN-EQ', 'AXISBANK-EQ', 'INDUSINDBK-EQ', 'AUBANK-EQ', 'BANDHANBNK-EQ', 'PNB-EQ', 'FEDERALBNK-EQ'],
    'NIFTY FIN SERVICE': ['HDFCBANK-EQ', 'ICICIBANK-EQ', 'SBIN-EQ', 'LICI-EQ', 'BAJFINANCE-EQ', 'BAJAJFINSV-EQ', 'KOTAKBANK-EQ', 'AXISBANK-EQ', 'JIOFIN-EQ', 'PFC-EQ'],
    'NIFTY FMCG': ['HINDUNILVR-EQ', 'ITC-EQ', 'NESTLEIND-EQ', 'VBL-EQ', 'BRITANNIA-EQ', 'TATACONSUM-EQ', 'DABUR-EQ', 'GODREJCP-EQ', 'COLPAL-EQ', 'MARICO-EQ'],
    'NIFTY IT': ['TCS-EQ', 'INFY-EQ', 'HCLTECH-EQ', 'WIPRO-EQ', 'TECHM-EQ', 'LTIM-EQ', 'PERSISTENT-EQ', 'COFORGE-EQ', 'MPHASIS-EQ', 'OFSS-EQ'],
    'NIFTY METAL': ['TATASTEEL-EQ', 'HINDALCO-EQ', 'JSWSTEEL-EQ', 'VEDL-EQ', 'NATIONALUM-EQ', 'JINDALSTEL-EQ', 'SAIL-EQ', 'APLAPOLLO-EQ', 'HINDZINC-EQ', 'NMDC-EQ'],
    'NIFTY OIL & GAS': ['RELIANCE-EQ', 'ONGC-EQ', 'IOC-EQ', 'BPCL-EQ', 'GAIL-EQ', 'HINDPETRO-EQ', 'OIL-EQ', 'PETRONET-EQ', 'IGL-EQ', 'GSPL-EQ'],
    'NIFTY PHARMA': ['SUNPHARMA-EQ', 'DRREDDY-EQ', 'CIPLA-EQ', 'DIVISLAB-EQ', 'LUPIN-EQ', 'AUROPHARMA-EQ', 'MANKIND-EQ', 'ZYDUSLIFE-EQ', 'ALKEM-EQ', 'TORNTPHARM-EQ'],
    'NIFTY REALTY': ['DLF-EQ', 'LODHA-EQ', 'GODREJPROP-EQ', 'OBEROIRLTY-EQ', 'PHOENIXLTD-EQ', 'PRESTIGE-EQ', 'SOBHA-EQ', 'BRIGADE-EQ', 'SUNTECK-EQ', 'MAHLIFE-EQ'],
    'NIFTY HEALTHCARE': ['SUNPHARMA-EQ', 'MAXHEALTH-EQ', 'APOLLOHOSP-EQ', 'CIPLA-EQ', 'FORTIS-EQ', 'DRREDDY-EQ', 'DIVISLAB-EQ', 'LUPIN-EQ', 'MANKIND-EQ', 'AUROPHARMA-EQ'],
}


class WatchlistService:
    def list_items(self) -> list[WatchlistItem]:
        with SessionLocal() as session:
            return session.query(WatchlistItem).order_by(WatchlistItem.sector, WatchlistItem.symbol).all()

    def enabled_items(self) -> list[WatchlistItem]:
        with SessionLocal() as session:
            return session.query(WatchlistItem).filter(WatchlistItem.enabled == 'true').order_by(WatchlistItem.symbol).all()

    def add_symbol(
        self,
        symbol: str,
        sector: str = 'Custom',
        source: str = 'manual',
        exchange: str = 'NSE',
        symbol_token: str | None = None,
    ) -> bool:
        normalized = symbol.strip().upper()
        if not normalized:
            return False
        with SessionLocal() as session:
            exists = session.query(WatchlistItem).filter(WatchlistItem.symbol == normalized).first()
            if exists:
                return False
            session.add(
                WatchlistItem(
                    symbol=normalized,
                    exchange=exchange.strip().upper() or 'NSE',
                    symbol_token=(symbol_token.strip() if symbol_token else None),
                    sector=sector,
                    source=source,
                    enabled='true',
                )
            )
            session.commit()
            return True

    def remove_symbol(self, symbol: str) -> bool:
        normalized = symbol.strip().upper()
        with SessionLocal() as session:
            row = session.query(WatchlistItem).filter(WatchlistItem.symbol == normalized).first()
            if not row:
                return False
            session.delete(row)
            session.commit()
            return True

    def set_enabled(self, symbol: str, enabled: bool) -> bool:
        normalized = symbol.strip().upper()
        with SessionLocal() as session:
            row = session.query(WatchlistItem).filter(WatchlistItem.symbol == normalized).first()
            if not row:
                return False
            row.enabled = 'true' if enabled else 'false'
            session.commit()
            return True

    def update_token(self, symbol: str, exchange: str, symbol_token: str) -> None:
        normalized = symbol.strip().upper()
        with SessionLocal() as session:
            row = session.query(WatchlistItem).filter(WatchlistItem.symbol == normalized).first()
            if not row:
                return
            row.exchange = exchange.strip().upper() or 'NSE'
            row.symbol_token = symbol_token.strip()
            session.commit()

    def seed_sector_defaults(self, force: bool = False) -> int:
        inserted = 0
        with SessionLocal() as session:
            if force:
                session.query(WatchlistItem).filter(WatchlistItem.source == 'nifty_sector_seed').delete()
                session.commit()

            existing_symbols = {
                row.symbol for row in session.query(WatchlistItem.symbol).all()
            }
            for sector, symbols in SECTOR_TOP10.items():
                for symbol in symbols:
                    if symbol in existing_symbols:
                        continue
                    session.add(
                        WatchlistItem(
                            symbol=symbol,
                            exchange='NSE',
                            symbol_token=None,
                            sector=sector,
                            source='nifty_sector_seed',
                            enabled='true',
                        )
                    )
                    existing_symbols.add(symbol)
                    inserted += 1
            session.commit()

        return inserted

    def normalize_symbols(self) -> int:
        changed = 0
        with SessionLocal() as session:
            rows = session.query(WatchlistItem).all()
            existing = {r.symbol for r in rows}
            for row in rows:
                if not row.symbol.endswith('.NS'):
                    continue
                mapped = row.symbol.replace('.NS', '-EQ')
                if mapped in existing:
                    session.delete(row)
                    changed += 1
                    continue
                row.symbol = mapped
                existing.add(mapped)
                changed += 1
            session.commit()
        return changed

    def bulk_add(self, symbols: Iterable[str], sector: str = 'Custom', source: str = 'manual') -> int:
        added = 0
        for sym in symbols:
            if self.add_symbol(sym, sector=sector, source=source):
                added += 1
        return added
