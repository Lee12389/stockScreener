# Angel One AutoTrader

Extensible FastAPI backend plus a shared Expo Router client for strategy scanning, paper trading, and future live automation across web, Android, and iOS.

## Highlights

- Angel One SmartAPI integration for symbol search, quotes, and candle history.
- API-first architecture for heavy frontend rendering (web/mobile) while backend focuses on business logic and risk calculations.
- Strategy page with:
  - RSI multi-timeframe flow
  - Supertrend support/resistance signals
  - Merged strategy mode (RSI + Supertrend)
  - filters, lightweight sparklines, and cached fast rendering
- Watchlist page with sector default seeds (top 10 per sector starter set).
- Smart scanner page with:
  - backend raw candle fetch + frontend indicator/scanner math
  - TradingView-style indicator toggles and column controls
  - daily, weekly, and monthly setup hunting
  - expanded local charts with EMA, VWAP, Bollinger, Supertrend, RSI, stochastic, MACD, and volume
  - practical presets like momentum breakout, trend pullback, VWAP reclaim, relative strength, squeeze, support bounce, and reversal sell
- Paper trading system:
  - configurable paper capital
  - manual paper trade by symbol and strategy
  - automated paper trader (interval based)
  - quantity optimization based on capital, signal strength, and trade slots
  - positions, trade ledger, realized/unrealized PnL, equity
- Safe live mode guardrails remain (paper-first default).

## Config Priority

1. environment variables
2. `.env`
3. `defaults.yaml`

`defaults.yaml` and `.env` are git-ignored.

## Run (Windows)

```powershell
./scripts/run_windows.ps1
```

## Run (Linux/macOS)

```bash
bash ./scripts/run_linux.sh
```

## Run Cross-Platform Client

The `client/` app is a shared Expo Router frontend that targets web, Android, and iOS from one codebase.

Windows:

```powershell
./scripts/run_client_windows.ps1 -Target web
./scripts/run_client_windows.ps1 -Target android
./scripts/run_client_windows.ps1 -Target ios
```

Linux/macOS:

```bash
bash ./scripts/run_client_linux.sh web
bash ./scripts/run_client_linux.sh android
bash ./scripts/run_client_linux.sh ios
```

You can also work directly inside `client/` with:

```bash
npm run web
npm run android
npm run ios
```

Set `EXPO_PUBLIC_API_BASE_URL` or update the in-app Settings screen if the client needs to reach a different backend host than the default local machine target.

## Cleanup / Maintenance

Use the cleanup helpers to prune stale SQLite rows, temporary caches, and old compiled files from the repo.

Windows:

```powershell
./scripts/cleanup_windows.ps1
./scripts/cleanup_windows.ps1 --dry-run
```

Linux/macOS:

```bash
bash ./scripts/cleanup_linux.sh
bash ./scripts/cleanup_linux.sh --dry-run
```

The cleanup tool uses Python's built-in `sqlite3` module and supports retention flags such as `--scan-cache-days`, `--analysis-days`, `--paper-trade-days`, and `--bot-trade-days`.

## Main Pages

- `/` dashboard
- `/watchlist` watchlist management
- `/strategies` RSI / Supertrend / merged signals
- `/paper` paper trading account, manual and automated paper execution
- `/tournament` 10-strategy bot tournament (each bot starts with configurable capital)
- `/scanner` smart multi-timeframe scanner with indicator toggles
- `/monitor` bought stocks reversal monitor (weak/strong sell)
- `/options-lab` unified Nifty50 options strategy engine + custom strategy builder

## Key APIs

- `GET /api/strategies/scan?strategy=rsi|supertrend|merged`
- `POST /api/paper/fund`
- `POST /api/paper/trade`
- `POST /api/paper/auto/start`
- `POST /api/paper/auto/stop`
- `GET /api/paper/summary`
- `POST /api/tournament/init`
- `POST /api/tournament/run-once`
- `POST /api/tournament/start`
- `POST /api/tournament/stop`
- `GET /api/tournament/leaderboard`
- `POST /api/options/recommend`
- `POST /api/options/custom`

## Frontend-Heavy Architecture (Current Direction)

- Backend responsibility:
  - broker connection/session
  - candle/option chain fetch and durable SQLite state
  - risk/business calculations and trade execution
  - paper-trade execution and ledger
- Frontend responsibility:
  - scanner indicator math, ranking, filtering, and shortlist generation after raw fetch
  - charts/graphs/payoff visuals
  - interactive strategy building UX and chart toggles
  - high-frequency UI updates and device-specific optimizations

## Multi-Platform Plan (Web + Android + iOS)

- Shared Expo Router app now lives in `client/`.
- The same client codebase serves:
  - web via Expo web export/dev server
  - Android via Expo/Android tooling
  - iOS via Expo/iOS tooling
- CORS is enabled (`CORS_ORIGINS`) so the Expo web client can connect to the backend.
- The in-app Settings screen lets phones point to the laptop LAN IP when you run the backend locally.

## Notes

- First full fresh scan can take time depending on watchlist size.
- After the scanner dataset is fetched, the browser handles filters, scores, scan presets, and chart rendering locally.
- The Expo client also keeps scanner ranking/filtering logic on-device after the raw dataset fetch.
- Weekly and monthly scanner intervals are available for longer-term swing and position scans.
- Live trading stays disabled unless explicitly enabled with env + mode switch.


