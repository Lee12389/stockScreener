from __future__ import annotations

from collections.abc import Iterable

from app.db import SessionLocal, WatchlistItem


SECTOR_TOP10 = {
    'NIFTY AUTO': ['MARUTI.NS', 'M&M.NS', 'TATAMOTORS.NS', 'BAJAJ-AUTO.NS', 'EICHERMOT.NS', 'HEROMOTOCO.NS', 'TVSMOTOR.NS', 'ASHOKLEY.NS', 'BALKRISIND.NS', 'BHARATFORG.NS'],
    'NIFTY BANK': ['HDFCBANK.NS', 'ICICIBANK.NS', 'KOTAKBANK.NS', 'SBIN.NS', 'AXISBANK.NS', 'INDUSINDBK.NS', 'AUBANK.NS', 'BANDHANBNK.NS', 'PNB.NS', 'FEDERALBNK.NS'],
    'NIFTY FIN SERVICE': ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'LICI.NS', 'BAJFINANCE.NS', 'BAJAJFINSV.NS', 'KOTAKBANK.NS', 'AXISBANK.NS', 'JIOFIN.NS', 'PFC.NS'],
    'NIFTY FMCG': ['HINDUNILVR.NS', 'ITC.NS', 'NESTLEIND.NS', 'VBL.NS', 'BRITANNIA.NS', 'TATACONSUM.NS', 'DABUR.NS', 'GODREJCP.NS', 'COLPAL.NS', 'MARICO.NS'],
    'NIFTY IT': ['TCS.NS', 'INFY.NS', 'HCLTECH.NS', 'WIPRO.NS', 'TECHM.NS', 'LTIM.NS', 'PERSISTENT.NS', 'COFORGE.NS', 'MPHASIS.NS', 'OFSS.NS'],
    'NIFTY METAL': ['TATASTEEL.NS', 'HINDALCO.NS', 'JSWSTEEL.NS', 'VEDL.NS', 'NATIONALUM.NS', 'JINDALSTEL.NS', 'SAIL.NS', 'APLAPOLLO.NS', 'HINDZINC.NS', 'NMDC.NS'],
    'NIFTY OIL & GAS': ['RELIANCE.NS', 'ONGC.NS', 'IOC.NS', 'BPCL.NS', 'GAIL.NS', 'HINDPETRO.NS', 'OIL.NS', 'PETRONET.NS', 'IGL.NS', 'GSPL.NS'],
    'NIFTY PHARMA': ['SUNPHARMA.NS', 'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS', 'LUPIN.NS', 'AUROPHARMA.NS', 'MANKIND.NS', 'ZYDUSLIFE.NS', 'ALKEM.NS', 'TORNTPHARM.NS'],
    'NIFTY REALTY': ['DLF.NS', 'LODHA.NS', 'GODREJPROP.NS', 'OBEROIRLTY.NS', 'PHOENIXLTD.NS', 'PRESTIGE.NS', 'SOBHA.NS', 'BRIGADE.NS', 'SUNTECK.NS', 'MAHLIFE.NS'],
    'NIFTY HEALTHCARE': ['SUNPHARMA.NS', 'MAXHEALTH.NS', 'APOLLOHOSP.NS', 'CIPLA.NS', 'FORTIS.NS', 'DRREDDY.NS', 'DIVISLAB.NS', 'LUPIN.NS', 'MANKIND.NS', 'AUROPHARMA.NS'],
}


class WatchlistService:
    def list_items(self) -> list[WatchlistItem]:
        with SessionLocal() as session:
            return session.query(WatchlistItem).order_by(WatchlistItem.sector, WatchlistItem.symbol).all()

    def enabled_symbols(self) -> list[str]:
        with SessionLocal() as session:
            rows = session.query(WatchlistItem).filter(WatchlistItem.enabled == 'true').all()
            return [r.symbol for r in rows]

    def add_symbol(self, symbol: str, sector: str = 'Custom', source: str = 'manual') -> bool:
        normalized = symbol.strip().upper()
        if not normalized:
            return False
        with SessionLocal() as session:
            exists = session.query(WatchlistItem).filter(WatchlistItem.symbol == normalized).first()
            if exists:
                return False
            session.add(WatchlistItem(symbol=normalized, sector=sector, source=source, enabled='true'))
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

    def seed_sector_defaults(self, force: bool = False) -> int:
        inserted = 0
        with SessionLocal() as session:
            if not force:
                count = session.query(WatchlistItem).count()
                if count > 0:
                    return 0
            existing_symbols = {
                row.symbol for row in session.query(WatchlistItem.symbol).all()
            }
            for sector, symbols in SECTOR_TOP10.items():
                for symbol in symbols:
                    if symbol in existing_symbols:
                        continue
                    session.add(WatchlistItem(symbol=symbol, sector=sector, source='nifty_sector_seed', enabled='true'))
                    existing_symbols.add(symbol)
                    inserted += 1
            session.commit()

        return inserted

    def bulk_add(self, symbols: Iterable[str], sector: str = 'Custom', source: str = 'manual') -> int:
        added = 0
        for sym in symbols:
            if self.add_symbol(sym, sector=sector, source=source):
                added += 1
        return added
