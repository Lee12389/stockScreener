"""Built-in stock universe definitions for scanner expansion."""

from __future__ import annotations

from app.services.watchlist import SECTOR_TOP10

NIFTY50 = [
    'ADANIENT-EQ','ADANIPORTS-EQ','APOLLOHOSP-EQ','ASIANPAINT-EQ','AXISBANK-EQ','BAJAJ-AUTO-EQ','BAJAJFINSV-EQ','BAJFINANCE-EQ',
    'BEL-EQ','BHARTIARTL-EQ','BPCL-EQ','BRITANNIA-EQ','CIPLA-EQ','COALINDIA-EQ','DRREDDY-EQ','EICHERMOT-EQ','ETERNAL-EQ',
    'GRASIM-EQ','HCLTECH-EQ','HDFCBANK-EQ','HDFCLIFE-EQ','HEROMOTOCO-EQ','HINDALCO-EQ','HINDUNILVR-EQ','ICICIBANK-EQ',
    'INDUSINDBK-EQ','INFY-EQ','ITC-EQ','JIOFIN-EQ','JSWSTEEL-EQ','KOTAKBANK-EQ','LT-EQ','M&M-EQ','MARUTI-EQ','NESTLEIND-EQ',
    'NTPC-EQ','ONGC-EQ','POWERGRID-EQ','RELIANCE-EQ','SBILIFE-EQ','SBIN-EQ','SHRIRAMFIN-EQ','SUNPHARMA-EQ','TATACONSUM-EQ',
    'TATAMOTORS-EQ','TATASTEEL-EQ','TCS-EQ','TECHM-EQ','TITAN-EQ','TRENT-EQ','ULTRACEMCO-EQ','WIPRO-EQ'
]

MIDCAP150_SAMPLE = sorted({s for sector in SECTOR_TOP10.values() for s in sector})

# Lightweight built-in list; user can keep this ON/OFF. Extend later via file import.
NIFTY500_SAMPLE = sorted(set(NIFTY50 + MIDCAP150_SAMPLE))


def build_universe(include_nifty50: bool, include_midcap150: bool, include_nifty500: bool, custom_symbols: list[str]) -> list[str]:
    """Builds the effective scanner symbol universe from enabled sources."""
    symbols: set[str] = set()
    if include_nifty50:
        symbols.update(NIFTY50)
    if include_midcap150:
        symbols.update(MIDCAP150_SAMPLE)
    if include_nifty500:
        symbols.update(NIFTY500_SAMPLE)
    symbols.update([s.strip().upper() for s in custom_symbols if s.strip()])
    return sorted(symbols)
