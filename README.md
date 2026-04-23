# Angel One AutoTrader

Angel One AutoTrader is a local-first trading workspace built with an internal FastAPI backend, SQLite storage, a public web gateway, and a shared Expo Router client for web, Android, and iOS.

The project is optimized around one core rule: once the backend has fetched raw market data, heavy scanner operations should happen on the user's machine. That keeps charting, indicator expansion, preset tuning, and future feature growth fast and flexible.

## Documentation Map

- [User Guide](./docs/user-guide.md)
- [Developer Guide](./docs/developer-guide.md)
- [Architecture](./docs/architecture.md)
- [API Reference](./docs/api-reference.md)

## Highlights

- Angel One SmartAPI integration for symbol search, quotes, and candle history
- frontend-heavy scanner architecture for web and mobile
- daily, weekly, and monthly scan workflows
- TradingView-style scanner controls and expanded charts in the web app
- shared Expo client for Desk, Scanner, Watchlist, Paper, Strategies, Monitor, Tournament, Options Lab, and Settings
- paper trading, tournament simulation, and options strategy tooling
- SQLite-backed local persistence plus cleanup helpers

## Config Priority

1. environment variables
2. `.env`
3. `defaults.yaml`

`defaults.yaml` and `.env` are git-ignored.

## Internal API Quick Start

Windows:

```powershell
./scripts/run_windows.ps1
```

Linux/macOS:

```bash
bash ./scripts/run_linux.sh
```

The internal FastAPI API listens on `127.0.0.1:1516` by default.

## Public Web Gateway

Windows:

```powershell
./scripts/run_public_windows.ps1
```

Linux/macOS:

```bash
bash ./scripts/run_public_linux.sh
```

The gateway keeps the current web routes on port `5015`, proxies them back to the internal API on `127.0.0.1:1516`, and also serves the exported Expo web client at `/app`.

For Linux server refreshes, rebuild the frontend and restart both services with:

```bash
bash ./scripts/refresh_linux_deploy.sh /opt/autoBot
```

## Shared Client Quick Start

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

Web uses the current browser origin automatically when it is served through the public gateway. Set `EXPO_PUBLIC_API_BASE_URL` or change the in-app Settings screen when native builds should talk to a different host.

## Android Debug Build / Install

```powershell
./scripts/install_android_debug.ps1
./scripts/install_android_debug.ps1 -NoInstall
```

The APK is produced at `client/android/app/build/outputs/apk/debug/app-debug.apk`.

## Cleanup

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

## Main Surfaces

- `/` dashboard / Desk
- `/watchlist`
- `/strategies`
- `/scanner`
- `/monitor`
- `/paper`
- `/tournament`
- `/options-lab`

## Important Notes

- first full scanner refresh can take time depending on the universe size
- once the dataset is fetched, the scanner math is intentionally performed on the web/mobile client
- weekly and monthly intervals are available for longer-term stock selection
- the recommended deployment shape is public gateway on `5015` plus internal API on `1516`
- live trading stays opt-in; paper remains the default safe path
