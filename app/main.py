from pathlib import Path

from fastapi import FastAPI, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.db import SessionLocal, get_state, init_db, set_state
from app.models import AutomationRequest, SessionStatus, TradeRequest
from app.services.analysis import AnalysisService
from app.services.angel_client import AngelClient
from app.services.automation import AutomationService
from app.services.strategy import StrategyService
from app.services.trade_engine import TradeEngine
from app.services.watchlist import WatchlistService

settings = get_settings()
app = FastAPI(title=settings.app_name)

base_dir = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(base_dir / 'templates'))
app.mount('/static', StaticFiles(directory=str(base_dir / 'static')), name='static')

angel_client = AngelClient()
analysis_service = AnalysisService(angel_client)
trade_engine = TradeEngine(angel_client)
automation_service = AutomationService(analysis_service, trade_engine)
watchlist_service = WatchlistService()
strategy_service = StrategyService(angel_client, watchlist_service)


@app.on_event('startup')
def startup() -> None:
    init_db()
    with SessionLocal() as session:
        get_state(session, 'trade_mode', settings.default_mode)
    watchlist_service.seed_sector_defaults(force=False)
    watchlist_service.normalize_symbols()


@app.get('/api/health')
def health() -> dict:
    return {'status': 'ok', 'app': settings.app_name}


@app.post('/api/session/connect', response_model=SessionStatus)
def connect_session() -> SessionStatus:
    ok, msg = angel_client.connect()
    return SessionStatus(connected=ok, message=msg)


@app.get('/api/analysis/top-performers')
def top_performers() -> list[dict]:
    if not angel_client.is_connected():
        angel_client.connect()
    watch_symbols = [row.symbol for row in watchlist_service.enabled_items()]
    return [p.model_dump() for p in analysis_service.top_performers_from_symbols(watch_symbols)]


@app.post('/api/analysis/suggestions')
def suggestions() -> dict:
    if not angel_client.is_connected():
        angel_client.connect()
    watch_symbols = [row.symbol for row in watchlist_service.enabled_items()]
    performers = analysis_service.top_performers_from_symbols(watch_symbols)
    bundle = analysis_service.suggestions(performers)
    return bundle.model_dump()


@app.post('/api/trade/mode/{mode}')
def set_trade_mode(mode: str) -> dict:
    mode = mode.lower().strip()
    if mode not in {'paper', 'live'}:
        return {'ok': False, 'message': 'mode must be paper or live'}
    with SessionLocal() as session:
        set_state(session, 'trade_mode', mode)
    return {'ok': True, 'mode': mode}


@app.post('/api/trade/execute')
def execute_trade(req: TradeRequest) -> dict:
    result = trade_engine.execute(req)
    return result.model_dump()


@app.post('/api/automation/start')
def start_automation(req: AutomationRequest) -> dict:
    automation_service.start(req.interval_minutes, req.auto_trade)
    return {'ok': True, 'message': 'Automation started.'}


@app.post('/api/automation/stop')
def stop_automation() -> dict:
    automation_service.stop()
    return {'ok': True, 'message': 'Automation stopped.'}


@app.get('/api/watchlist')
def api_watchlist() -> list[dict]:
    rows = watchlist_service.list_items()
    return [
        {
            'symbol': r.symbol,
            'exchange': r.exchange,
            'symbol_token': r.symbol_token,
            'sector': r.sector,
            'source': r.source,
            'enabled': r.enabled,
        }
        for r in rows
    ]


@app.get('/api/strategies/rsa-scan')
def api_strategy_scan(
    sector: str = Query(default='all'),
    trigger: str = Query(default='all'),
    min_change_pct: float = Query(default=-100.0),
    min_daily_rsi: float = Query(default=0.0),
    limit: int = Query(default=10, ge=1, le=500),
    refresh: bool = Query(default=False),
) -> dict:
    hits, error = strategy_service.scan_rsa_flow(force_refresh=refresh)
    if error:
        return {'count': 0, 'hits': [], 'error': error}

    filtered = _filter_hits(hits, sector, trigger, min_change_pct, min_daily_rsi)
    filtered = filtered[:limit]
    return {
        'count': len(filtered),
        'hits': [
            {
                'symbol': h.symbol,
                'exchange': h.exchange,
                'sector': h.sector,
                'monthly_rsi': h.monthly_rsi,
                'weekly_rsi': h.weekly_rsi,
                'daily_rsi': h.daily_rsi,
                'change_pct': h.change_pct,
                'triggers': h.triggers,
                'note': h.note,
            }
            for h in filtered
        ],
    }


@app.get('/', response_class=HTMLResponse)
def dashboard(request: Request, refresh: bool = Query(default=False)):
    performers = []
    suggestions = []
    info_message = 'Data not refreshed yet. Click Refresh Dashboard to fetch latest broker data.'
    if refresh:
        ok, msg = angel_client.ensure_connected()
        if ok:
            watch_symbols = [row.symbol for row in watchlist_service.enabled_items()]
            performers = analysis_service.top_performers_from_symbols(watch_symbols)
            bundle = analysis_service.suggestions(performers)
            suggestions = bundle.suggestions
            info_message = f'Dashboard refreshed for {len(watch_symbols)} symbols.'
        else:
            info_message = f'Unable to refresh dashboard: {msg}'

    with SessionLocal() as session:
        mode = get_state(session, 'trade_mode', settings.default_mode)

    return templates.TemplateResponse(
        request=request,
        name='index.html',
        context={
            'app_name': settings.app_name,
            'connected': angel_client.is_connected(),
            'mode': mode,
            'performers': performers,
            'suggestions': suggestions,
            'allow_live': settings.allow_live_trades,
            'info_message': info_message,
        },
    )


@app.get('/watchlist', response_class=HTMLResponse)
def watchlist_page(request: Request):
    rows = watchlist_service.list_items()
    return templates.TemplateResponse(
        request=request,
        name='watchlist.html',
        context={'app_name': settings.app_name, 'items': rows},
    )


@app.post('/watchlist/add')
def watchlist_add(
    symbol: str = Form(...),
    sector: str = Form('Custom'),
    exchange: str = Form('NSE'),
    symbol_token: str = Form(''),
):
    watchlist_service.add_symbol(symbol, sector=sector, source='manual', exchange=exchange, symbol_token=symbol_token)
    return RedirectResponse('/watchlist', status_code=303)


@app.post('/watchlist/remove')
def watchlist_remove(symbol: str = Form(...)):
    watchlist_service.remove_symbol(symbol)
    return RedirectResponse('/watchlist', status_code=303)


@app.post('/watchlist/seed-defaults')
def watchlist_seed_defaults():
    watchlist_service.seed_sector_defaults(force=True)
    return RedirectResponse('/watchlist', status_code=303)


@app.post('/watchlist/toggle')
def watchlist_toggle(symbol: str = Form(...), enabled: str = Form(...)):
    watchlist_service.set_enabled(symbol, enabled.lower() == 'true')
    return RedirectResponse('/watchlist', status_code=303)


@app.get('/strategies', response_class=HTMLResponse)
def strategies_page(
    request: Request,
    sector: str = Query(default='all'),
    trigger: str = Query(default='all'),
    min_change_pct: float = Query(default=-100.0),
    min_daily_rsi: float = Query(default=0.0),
    limit: int = Query(default=10),
    refresh: bool = Query(default=False),
):
    hits, error = strategy_service.scan_rsa_flow(force_refresh=refresh)
    filtered = _filter_hits(hits, sector, trigger, min_change_pct, min_daily_rsi)
    filtered = filtered[: max(1, min(limit, 500))]
    sectors = sorted({h.sector for h in hits})
    return templates.TemplateResponse(
        request=request,
        name='strategies.html',
        context={
            'app_name': settings.app_name,
            'watchlist_count': len(watchlist_service.enabled_items()),
            'hits': filtered,
            'all_hits_count': len(hits),
            'error': error,
            'sectors': sectors,
            'filters': {
                'sector': sector,
                'trigger': trigger,
                'min_change_pct': min_change_pct,
                'min_daily_rsi': min_daily_rsi,
                'limit': limit,
                'refresh': refresh,
            },
        },
    )


@app.post('/dashboard/mode')
def dashboard_mode(mode: str = Form(...)):
    return set_trade_mode(mode)


@app.post('/dashboard/connect')
def dashboard_connect():
    return connect_session()


def _filter_hits(hits, sector: str, trigger: str, min_change_pct: float, min_daily_rsi: float):
    out = []
    for h in hits:
        if sector != 'all' and h.sector != sector:
            continue
        if trigger != 'all' and trigger not in h.triggers:
            continue
        if h.change_pct < min_change_pct:
            continue
        if h.daily_rsi < min_daily_rsi:
            continue
        out.append(h)
    return out
