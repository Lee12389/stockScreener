# Developer Guide

## Project Goals

This codebase is designed around a frontend-heavy market-analysis workflow:

- the backend owns broker sessions, raw data fetches, persistence, and trade/paper services
- the web client and Expo client own indicator rendering, scans, ranking, and interaction-heavy views
- the same raw dataset should be reusable on desktop browsers, Android, and iOS without duplicating backend computation for every UI experiment

That split is intentional. If you add new indicators or presets, prefer pushing the math to the client once the necessary raw candles are already available.

## Repository Layout

```text
app/
  config.py              Runtime settings and defaults loading
  db.py                  SQLite models, session factory, schema guards
  main.py                FastAPI routes for APIs and web pages
  models.py              Pydantic request/response models
  services/              Broker, analysis, scanner, paper, options, tournament services
  static/                Browser scanner logic and CSS
  templates/             Jinja templates for the web UI
client/
  app/                   Expo Router screens and layouts
  components/            Shared native/web UI building blocks
  lib/                   API calls, types, scanner engine, formatting
  patches/               Native dependency fixes applied through patch-package
scripts/
  run_*                  Local launch helpers
  cleanup.py             SQLite/temp-cache cleanup utility
  install_android_*      Android debug build/install helpers
.github/workflows/
  client-cross-platform.yml
```

## Core Architecture

### Backend responsibilities

- session management with Angel One SmartAPI
- symbol lookup and candle fetches
- SQLite persistence
- watchlist and scanner configuration storage
- strategy snapshots used by paper trading and tournaments
- options strategy parsing and payoff packaging
- browser-rendered web pages and JSON APIs

### Frontend responsibilities

- scanner indicator computation after dataset fetch
- preset matching and scoring
- chart rendering and expanded detail views
- high-frequency filtering, sorting, and search
- mobile-specific host configuration and UX

## Key Backend Modules

### `app/config.py`

- loads settings from environment, `.env`, and `defaults.yaml`
- exposes `get_settings()` as the cached configuration entry point

### `app/db.py`

- defines all SQLite tables with SQLAlchemy
- creates the local database
- runs lightweight schema guards for local upgrades without Alembic
- seeds default paper/scanner rows when needed

### `app/main.py`

- wires the entire FastAPI app
- exposes both JSON endpoints and web page routes
- instantiates all services once at module import time

### `app/services/strategy.py`

- main market data and indicator service on the backend
- fetches broker candles
- normalizes intervals
- aggregates weekly/monthly candles from daily data
- exposes both strategy hits and raw dataset payloads

### `app/services/smart_scanner.py`

- owns scanner configuration persistence
- fetches raw dataset payloads
- provides legacy/backend-side scan summaries
- tracks bought rows for the monitor flow

### `app/services/paper_trader.py`

- manages paper account cash, positions, and trade ledger
- converts strategy output into simulated execution
- can run interval-based automated paper trades through APScheduler

### `app/services/strategy_tournament.py`

- resets and runs multiple synthetic bots
- scores strategies against the same market snapshot
- keeps bot positions, bot trades, and leaderboard summaries in SQLite

## Shared Client Modules

### `client/lib/api.ts`

- single API wrapper used by all Expo screens
- central place for request formatting and error handling

### `client/lib/api-config.tsx`

- resolves the backend base URL for web, simulator, and physical device cases
- persists manual API host overrides in `AsyncStorage`

### `client/lib/scanner-engine.ts`

- shared scanner brain for Expo
- converts raw dataset items into ranked scanner rows
- computes RSI, MACD, ADX, stochastic, Bollinger, Supertrend, VWAP, EMA, SMA, and aggregation helpers
- should remain the main extension point for new mobile/web scanner ideas

### `app/static/scanner.js`

- browser-only scanner controller for the rich Jinja-based web page
- mirrors the client-side scoring philosophy used in the Expo app
- handles filter state, expanded canvas chart rendering, CSV export, and bought tracking UX

## Data Flow

### Scanner dataset flow

1. the client requests `/api/scanner/dataset`
2. `SmartScannerService` resolves the symbol universe and scanner config
3. `StrategyService.get_market_dataset()` fetches primary and daily candles
4. the backend returns raw candles plus config and bought rows
5. the frontend computes indicators, presets, scores, and chart series locally

This is the most important architectural rule in the repo.

### Paper trading flow

1. the client or web form requests a paper action
2. `PaperTraderService` asks `StrategyService` for strategy rows
3. the selected symbol is sized and executed inside SQLite
4. summaries and open positions are recalculated for the UI

### Tournament flow

1. the service fetches one market snapshot
2. each bot is marked to market
3. each bot evaluates exits, then potential new entries
4. the leaderboard is built from persisted bot state

## Adding New Indicators or Scans

Preferred path:

1. make sure the dataset already includes the raw candles you need
2. add the indicator helper in `client/lib/scanner-engine.ts`
3. update `buildRowSummary()` and any derived chart series
4. expose new preset logic in `matchesPreset()` or related scan flags
5. add UI toggles in the relevant screen or in `app/static/scanner.js`

Only move indicator math to the backend when:

- it is required by a backend-only workflow
- it materially reduces payload size
- it is needed for server-side persistence or execution logic

## Database Notes

The app uses local SQLite through SQLAlchemy. Important tables include:

- `app_state`
- `watchlist_items`
- `trade_logs`
- `analysis_snapshots`
- `paper_account`
- `paper_positions`
- `paper_trades`
- `strategy_bots`
- `strategy_bot_positions`
- `strategy_bot_trades`
- `bought_monitor`
- `scanner_config`
- `scan_result_cache`

Use `scripts/cleanup.py` to prune stale rows and temp files instead of manually deleting database content.

## Local Development

### Backend

```powershell
./scripts/run_windows.ps1
```

```bash
bash ./scripts/run_linux.sh
```

### Expo client

```powershell
./scripts/run_client_windows.ps1 -Target web
./scripts/run_client_windows.ps1 -Target android
```

```bash
bash ./scripts/run_client_linux.sh web
```

### Android debug build

```powershell
./scripts/install_android_debug.ps1
```

## Verification Commands

Backend:

```powershell
python -m compileall app
python -c "from app.main import app; print('app-import-ok')"
```

Client:

```powershell
cd client
npm run typecheck
npm run doctor
npm run export:web
```

## CI and Cross-Platform Checks

`.github/workflows/client-cross-platform.yml` is responsible for validating the shared client. It exists to catch:

- Expo web regressions
- Android build regressions
- iOS build regressions on hosted runners

## Documentation and Commenting Standard

This repo now follows a simple standard:

- backend Python functions should have concise docstrings that explain responsibility
- shared frontend helpers and screen entry points should have short JSDoc-style comments when they are part of the maintained app code
- comments should explain intent, ownership, or data flow, not restate obvious syntax

Generated files, vendored dependencies, and native build output should stay out of the manual documentation pass.

## Safe Extension Guidelines

- do not move scanner-heavy work back into the backend unless there is a strong reason
- keep mobile and web behavior aligned where possible
- avoid destructive changes to user SQLite data
- treat live trading as opt-in and paper mode as the default path
- when changing interval handling, update both the backend aggregation logic and the client display helpers

## Useful Reading

- [User Guide](./user-guide.md)
- [Architecture](./architecture.md)
- [API Reference](./api-reference.md)
