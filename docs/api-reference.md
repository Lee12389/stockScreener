# API Reference

## Health and Session

### `GET /api/health`

- returns backend status and app name
- used by the Desk/dashboard to confirm the backend is reachable

### `POST /api/session/connect`

- attempts an Angel One session login
- returns a `SessionStatus` payload

## Dashboard and Analysis

### `GET /api/dashboard/summary`

Query params:

- `refresh`: when `true`, refreshes broker-backed dashboard data

Returns:

- connection state
- trade mode
- watchlist count
- top performers
- suggestion output

### `GET /api/analysis/top-performers`

- returns the ranked performer set for enabled watchlist symbols

### `POST /api/analysis/suggestions`

- turns the current performer set into suggestion rows

## Trade Mode and Execution

### `GET /api/trade/mode`

- returns current mode and whether live trading is allowed by config

### `POST /api/trade/mode/{mode}`

- switches between `paper` and `live`

### `POST /api/trade/execute`

- submits a trade through `TradeEngine`
- in safe/default configurations this stays paper-simulated

## Automation

### `POST /api/automation/start`

- starts the analysis automation scheduler

### `POST /api/automation/stop`

- stops all automation jobs for that service

## Paper Trading

### `GET /api/paper/summary`

- returns account balances, positions, trade history, and scheduler state

### `POST /api/paper/fund`

- resets the paper account to the supplied starting cash

### `POST /api/paper/trade`

- runs a manual or AUTO-driven paper trade for a symbol

### `POST /api/paper/auto/start`

- starts interval-based paper trading

### `POST /api/paper/auto/stop`

- stops interval-based paper trading

## Tournament

### `POST /api/tournament/init`

- resets bots and seeds tournament capital

### `POST /api/tournament/run-once`

- runs one full tournament cycle

### `POST /api/tournament/start`

- starts scheduled tournament execution

### `POST /api/tournament/stop`

- stops scheduled tournament execution

### `GET /api/tournament/leaderboard`

- returns bot standings and recent tournament trades

## Scanner

### `GET /api/scanner/config`

- returns persisted scanner configuration

### `POST /api/scanner/config`

- updates persisted scanner configuration

### `GET /api/scanner/dataset`

Query params:

- `refresh`
- `symbols` as a comma-separated shortlist

Returns:

- raw candle dataset
- scanner config
- bought rows
- scope symbol list
- generation timestamp

This is the primary dataset endpoint for frontend-side indicator work.

### `GET /api/scanner/scan`

- backend-side legacy scan summary

### `POST /api/scanner/scan-shortlist`

- backend-side scan for a small explicit symbol set

### `POST /api/scanner/bought/add`

- adds or updates a bought-monitor row

### `POST /api/scanner/bought/remove`

- removes a bought-monitor row

### `GET /api/scanner/bought/monitor`

- returns the current reversal-monitor summary

## Options Lab

### `POST /api/options/recommend`

- parses option chain CSV rows and returns packaged strategy suggestions

### `POST /api/options/custom`

- prices a custom multi-leg strategy from CSV legs

## Watchlist

### `GET /api/watchlist`

- returns all watchlist rows

### `POST /api/watchlist/add`

- adds a symbol

### `POST /api/watchlist/remove`

- removes a symbol

### `POST /api/watchlist/toggle`

- enables or disables a symbol

### `POST /api/watchlist/seed-defaults`

- seeds the sector default watchlist

## Strategy Scans

### `GET /api/strategies/scan`

Query params:

- `strategy`
- `sector`
- `trigger`
- `signal`
- `min_change_pct`
- `min_daily_rsi`
- `limit`
- `refresh`

Returns filtered RSI, Supertrend, or merged strategy rows.

### `GET /api/strategies/rsa-scan`

- compatibility endpoint that proxies the RSI strategy scan path

## Web Pages

These routes render Jinja pages instead of JSON:

- `GET /`
- `GET /watchlist`
- `GET /paper`
- `GET /tournament`
- `GET /scanner`
- `POST /scanner/shortlist`
- `GET /monitor`
- `GET /options-lab`
- `GET /strategies`

The matching form routes post back into those pages for the built-in web workflow.
