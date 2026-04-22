# User Guide

## What This App Does

Angel One AutoTrader is a local-first trading workspace built around three ideas:

- fetch broker-backed market data through the FastAPI backend
- keep heavy charting, indicator math, ranking, and scans on the web/mobile client after data arrives
- let you review setups, track bought positions, and practice execution with paper trading before turning on anything live

The app currently supports:

- browser-based web pages served by FastAPI
- a shared Expo client for web, Android, and iOS
- scanner workflows across intraday, daily, weekly, and monthly timeframes
- paper trading, watchlists, strategy scans, options planning, and bot tournaments

## Before You Start

### Required

- Python 3.11+ for the backend
- Node.js 20+ and npm for the Expo client
- Angel One SmartAPI credentials if you want broker-backed refreshes

### Optional

- Android Studio / Android SDK for local Android builds
- macOS + Xcode for local iOS builds
- a USB cable or shared Wi-Fi network when testing the phone app against your laptop backend

## Quick Start

### 1. Start the backend

Windows:

```powershell
./scripts/run_windows.ps1
```

Linux/macOS:

```bash
bash ./scripts/run_linux.sh
```

The backend serves both JSON APIs and the built-in web pages on port `5015` by default.

### 2. Start the shared client

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

### 3. Connect the broker session

You can do this from:

- the web dashboard at `/`
- the Expo client Desk screen

If credentials are missing, the app still runs, but broker-backed refreshes will stay unavailable.

## Daily Workflow

### 1. Check the Desk

Use the Desk / dashboard to confirm:

- backend health
- broker connection state
- current trade mode (`paper` or `live`)
- top performers and suggestion output

### 2. Confirm your watchlist and scanner universe

Use the Watchlist page or tab to:

- keep only the symbols you want enabled
- add manual symbols
- seed sector defaults if you want a starter universe

The scanner can also build its own broader universe from:

- Nifty 50
- midcap sample set
- Nifty 500 sample set
- your manual symbols

### 3. Run the scanner

The scanner is the main daily decision surface.

Recommended routine:

1. start with `ONE_DAY`, `ONE_WEEK`, or `ONE_MONTH` for directional context
2. enable weekly/monthly confirmation for stronger swing filters
3. refresh the dataset once
4. filter locally by score, preset, trend, RSI, ADX, price, and volume
5. open detail view for the symbols you care about
6. track the symbols you already bought

Important behavior:

- the backend only fetches raw candles and stores durable state
- the web page and Expo client compute indicators, presets, ranking, and expanded charts locally on your device
- once the dataset is loaded, most scanner interactions are instant because they stay on the frontend

### 4. Review timeframes intentionally

Suggested use:

- `FIFTEEN_MINUTE` / `ONE_HOUR`: intraday and short swing setups
- `ONE_DAY`: core daily scan
- `ONE_WEEK`: trend confirmation and long swing selection
- `ONE_MONTH`: position-trade and long-term context

### 5. Track bought positions

From the scanner detail view you can:

- record entry price
- record quantity
- add a short note
- update or remove tracked entries later

The Monitor screen then flags possible weakness using locally computed reversal logic.

### 6. Paper trade before going live

Use the Paper page or tab to:

- reset paper capital
- run manual trades
- let the backend size and execute paper trades from strategy signals
- run interval-based automated paper trading

This is the safest place to validate new filters, sizing ideas, or scan presets.

### 7. Use the Tournament and Options Lab when needed

Tournament:

- compares multiple scoring styles and synthetic instrument choices
- useful for idea benchmarking, not production execution

Options Lab:

- parses simple CSV option-chain inputs
- suggests default strategies
- lets you model custom multi-leg payoffs

### 8. Clean old local data

Run the cleanup script periodically so cached scans and old temp files do not accumulate.

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

## Web Usage

The built-in web app is available directly from the FastAPI server. Main pages:

- `/` dashboard
- `/watchlist`
- `/strategies`
- `/scanner`
- `/monitor`
- `/paper`
- `/tournament`
- `/options-lab`

Use the web version when you want:

- the richest scanner UI
- large-table filtering
- expanded browser charts
- easier CSV copy/download for visible symbols

## Mobile Usage

The Expo app shares the same business flows as the web version and works well for:

- monitoring the desk
- refreshing scanner datasets
- reviewing scored setups
- tracking bought symbols
- reviewing paper positions and recent trades

### Android

To build and install a debug APK on Windows:

```powershell
./scripts/install_android_debug.ps1
```

If you only want the APK without installing:

```powershell
./scripts/install_android_debug.ps1 -NoInstall
```

### iPhone / iPad

For iOS you need one of:

- a Mac with Xcode for local builds
- EAS Build

### Pointing the phone at your laptop

If the phone app cannot reach the backend:

1. keep the phone and laptop on the same network
2. find your laptop LAN IP
3. open the in-app Settings screen
4. set the API base URL to `http://<your-laptop-ip>:5015`

## Scanner Presets and Common Use Cases

The scanner includes common preset groups such as:

- quality momentum
- momentum breakout
- trend pullback
- relative strength
- VWAP reclaim
- supertrend continuation
- volume breakout
- Bollinger squeeze breakout
- support bounce
- mean reversion
- reversal sell

These presets are meant to be starting points, not blind trade instructions. Always review:

- multi-timeframe context
- support/resistance distance
- volume confirmation
- whether the stock is already extended

## Trade Mode Safety

The app defaults to paper-first behavior.

- `paper` mode simulates execution and keeps a paper ledger
- `live` mode still depends on backend safety settings before a real order can be sent

Do not enable live mode until you have validated:

- credentials
- symbol resolution
- quantity limits
- trade limits
- your own review process

## Troubleshooting

### Broker refresh fails

Check:

- `ANGEL_API_KEY`
- `ANGEL_CLIENT_CODE`
- `ANGEL_PIN`
- `ANGEL_TOTP_SECRET`

### Scanner loads but looks empty

Usually one of these is true:

- no symbols are enabled in the watchlist
- the broker session is disconnected
- the current filter stack is too strict
- this is the first run and you need a full refresh

### Phone app cannot connect

Check:

- laptop firewall rules
- CORS origins if you changed defaults
- the API base URL in the Settings screen
- whether the phone is on the same Wi-Fi network

### Old data feels stale

- refresh the dataset from the scanner
- reconnect the broker session
- run the cleanup script if the local cache has become noisy

## Recommended Operating Style

- use the daily, weekly, and monthly views first
- shortlist only the strongest setups
- track bought positions in the monitor
- validate new ideas with paper trading
- keep live mode off until you trust the workflow end to end

For implementation details, see [Developer Guide](./developer-guide.md), [Architecture](./architecture.md), and [API Reference](./api-reference.md).
