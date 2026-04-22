from __future__ import annotations

import argparse
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / 'autotrader.db'
DEFAULT_SCAN_CACHE_DAYS = 7
DEFAULT_ANALYSIS_DAYS = 30
DEFAULT_TRADE_LOG_DAYS = 180
DEFAULT_PAPER_TRADE_DAYS = 365
DEFAULT_BOT_TRADE_DAYS = 365


@dataclass
class CleanupResult:
    label: str
    removed: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Prune stale local SQLite data and temp caches.')
    parser.add_argument('--db', default=str(DB_PATH), help='Path to the SQLite database.')
    parser.add_argument('--scan-cache-days', type=int, default=DEFAULT_SCAN_CACHE_DAYS, help='Keep scanner result cache newer than this many days.')
    parser.add_argument('--analysis-days', type=int, default=DEFAULT_ANALYSIS_DAYS, help='Keep analysis snapshots newer than this many days.')
    parser.add_argument('--trade-log-days', type=int, default=DEFAULT_TRADE_LOG_DAYS, help='Keep trade logs newer than this many days.')
    parser.add_argument('--paper-trade-days', type=int, default=DEFAULT_PAPER_TRADE_DAYS, help='Keep paper trade history newer than this many days.')
    parser.add_argument('--bot-trade-days', type=int, default=DEFAULT_BOT_TRADE_DAYS, help='Keep tournament bot trade history newer than this many days.')
    parser.add_argument('--no-vacuum', action='store_true', help='Skip SQLite VACUUM after cleanup.')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be removed without changing anything.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db).resolve()
    if not db_path.exists():
        print(f'[cleanup] Database not found: {db_path}')
        return 1

    results: list[CleanupResult] = []
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        tables = existing_tables(conn)

        results.extend(
            [
                prune_older_than(conn, tables, 'scan_result_cache', 'updated_at', days=args.scan_cache_days, label='stale scan cache', dry_run=args.dry_run),
                prune_older_than(conn, tables, 'analysis_snapshots', 'created_at', days=args.analysis_days, label='analysis snapshots', dry_run=args.dry_run),
                prune_older_than(conn, tables, 'trade_logs', 'created_at', days=args.trade_log_days, label='trade logs', dry_run=args.dry_run),
                prune_older_than(conn, tables, 'paper_trades', 'created_at', days=args.paper_trade_days, label='paper trades', dry_run=args.dry_run),
                prune_older_than(conn, tables, 'strategy_bot_trades', 'created_at', days=args.bot_trade_days, label='tournament bot trades', dry_run=args.dry_run),
                prune_where(conn, tables, 'paper_positions', 'quantity <= 0', label='empty paper positions', dry_run=args.dry_run),
                prune_where(conn, tables, 'strategy_bot_positions', 'quantity <= 0', label='empty bot positions', dry_run=args.dry_run),
            ]
        )

        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
            if not args.no_vacuum:
                conn.execute('VACUUM')

    dir_results = cleanup_temp_dirs(ROOT, dry_run=args.dry_run)
    results.extend(dir_results)

    total = sum(result.removed for result in results)
    print('[cleanup] Summary')
    for result in results:
        print(f"  - {result.label}: {result.removed}")
    print(f'[cleanup] Total removed: {total}')
    if args.dry_run:
        print('[cleanup] Dry run only. No changes were written.')
    else:
        print(f'[cleanup] Database cleaned and ready: {db_path}')
    return 0


def existing_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {str(row['name']) for row in rows}


def prune_older_than(
    conn: sqlite3.Connection,
    tables: set[str],
    table: str,
    column: str,
    *,
    days: int,
    label: str,
    dry_run: bool,
) -> CleanupResult:
    if table not in tables:
        return CleanupResult(label, 0)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(days, 1))).strftime('%Y-%m-%d %H:%M:%S')
    count = conn.execute(f'SELECT COUNT(*) AS total FROM {table} WHERE {column} < ?', (cutoff,)).fetchone()['total']
    if count and not dry_run:
        conn.execute(f'DELETE FROM {table} WHERE {column} < ?', (cutoff,))
    return CleanupResult(label, int(count))


def prune_where(
    conn: sqlite3.Connection,
    tables: set[str],
    table: str,
    where_clause: str,
    *,
    label: str,
    dry_run: bool,
) -> CleanupResult:
    if table not in tables:
        return CleanupResult(label, 0)
    count = conn.execute(f'SELECT COUNT(*) AS total FROM {table} WHERE {where_clause}').fetchone()['total']
    if count and not dry_run:
        conn.execute(f'DELETE FROM {table} WHERE {where_clause}')
    return CleanupResult(label, int(count))


def cleanup_temp_dirs(root: Path, *, dry_run: bool) -> list[CleanupResult]:
    targets = ['__pycache__', '.pytest_cache']
    results: list[CleanupResult] = []
    for target in targets:
        matches = [path for path in root.rglob(target) if path.is_dir()]
        if not dry_run:
            for path in matches:
                shutil.rmtree(path, ignore_errors=True)
        results.append(CleanupResult(f'{target} directories', len(matches)))

    pyc_files = [path for path in root.rglob('*.pyc') if path.is_file()]
    if not dry_run:
        for path in pyc_files:
            try:
                path.unlink()
            except OSError:
                pass
    results.append(CleanupResult('compiled .pyc files', len(pyc_files)))
    return results


if __name__ == '__main__':
    raise SystemExit(main())
