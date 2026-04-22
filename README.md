# Angel One AutoTrader

Extensible FastAPI app for strategy scanning, paper trading, and future live automation.

## Highlights

- Angel One SmartAPI integration for symbol search, quotes, and candle history.
- API-first architecture for heavy frontend rendering (web/mobile) while backend focuses on business logic and risk calculations.
- Strategy page with:
  - RSI multi-timeframe flow
  - Supertrend support/resistance signals
  - Merged strategy mode (RSI + Supertrend)
  - filters, lightweight sparklines, and cached fast rendering
- Watchlist page with sector default seeds (top 10 per sector starter set).
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
  - candle/option chain fetch
  - indicator/risk/business calculations
  - filtering/ranking/scoring
  - paper-trade execution and ledger
- Frontend responsibility:
  - charts/graphs/payoff visuals
  - interactive strategy building UX
  - high-frequency UI updates and device-specific optimizations

## Multi-Platform Plan (Web + Android + iOS)

- Recommended stack:
  - Web: React + Vite + TypeScript
  - Mobile: React Native (Expo) reusing the same API contracts
  - Charts: TradingView Lightweight Charts / ECharts (frontend render)
- Current backend already supports this with REST endpoints.
- CORS is enabled (`CORS_ORIGINS`) so separate frontend apps can connect.

## Notes

- First full fresh scan can take time depending on watchlist size.
- After first scan, cached data returns quickly unless `refresh=true` is used.
- Live trading stays disabled unless explicitly enabled with env + mode switch.


