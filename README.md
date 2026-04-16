# Angel One AutoTrader (Extensible Starter)

This project is an extensible Python web app scaffold for:
- automated market analysis
- top performer scanning
- strategy suggestions
- automated order placement (paper mode by default)

## What is included

- FastAPI backend + HTML dashboard
- `SmartAPI` client wrapper for Angel One login/data/order APIs
- analysis engine with top-performer support and fallback logic
- simple suggestion engine (momentum thresholds)
- scheduler for recurring auto-analysis and optional auto-trading
- risk controls and safe defaults

## Safety defaults

- starts in `paper` mode
- live orders are blocked unless BOTH are true:
  1. `ALLOW_LIVE_TRADES=true` in env
  2. mode is set to `live` from API/UI
- quantity and daily-trade guardrails are enforced

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy env template:
   ```bash
   cp .env.example .env
   ```
   (On PowerShell: `Copy-Item .env.example .env`)
4. Fill Angel One credentials in `.env`.

## Run

```bash
uvicorn app.main:app --reload
```

Open: http://127.0.0.1:8000

## API endpoints

- `GET /api/health`
- `POST /api/session/connect`
- `GET /api/analysis/top-performers`
- `POST /api/analysis/suggestions`
- `POST /api/trade/execute`
- `POST /api/trade/mode/{mode}` (`paper` or `live`)
- `POST /api/automation/start`
- `POST /api/automation/stop`

## Next feature ideas

- multi-strategy framework (breakout/reversion/options)
- per-strategy backtesting
- PnL dashboard with broker orderbook reconciliation
- Telegram/Slack alerts
- advanced risk sizing and stop logic
- auth + multi-user workspaces

## Credential config

You can save credentials either in `.env` or in `defaults.yaml`.
Priority order is:
1. environment variables
2. `.env`
3. `defaults.yaml`

`defaults.yaml` is git-ignored for safety.

## New Pages

- `/watchlist`: add/remove symbols and reload sector defaults.
- `/strategies`: scans watchlist for your RSA flow (implemented with RSI).

## Strategy 1 (RSA Flow)

Implemented condition:
- Monthly RSI > 60
- Weekly RSI > 60
- Daily RSI cross above 40 or 60
- Daily RSI bounce-back around 40/60 zones

Note: rule name is shown as RSA in UI, calculated with RSI values.

## Sector Top 10 Defaults

On startup, app seeds watchlist with sector top-10 symbol sets (NIFTY sector starter universe). You can reload defaults from Watchlist page.
