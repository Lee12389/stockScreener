from pathlib import Path

from fastapi import FastAPI, Form, Request
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
strategy_service = StrategyService()


@app.on_event('startup')
def startup() -> None:
    init_db()
    with SessionLocal() as session:
        get_state(session, 'trade_mode', settings.default_mode)
    watchlist_service.seed_sector_defaults(force=False)


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
    return [p.model_dump() for p in analysis_service.top_performers()]


@app.post('/api/analysis/suggestions')
def suggestions() -> dict:
    if not angel_client.is_connected():
        angel_client.connect()
    performers = analysis_service.top_performers()
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
        {'symbol': r.symbol, 'sector': r.sector, 'source': r.source, 'enabled': r.enabled}
        for r in rows
    ]


@app.get('/api/strategies/rsa-scan')
def api_strategy_scan() -> dict:
    symbols = watchlist_service.enabled_symbols()
    hits = strategy_service.scan_rsa_flow(symbols)
    return {
        'count': len(hits),
        'hits': [
            {
                'symbol': h.symbol,
                'monthly_rsi': h.monthly_rsi,
                'weekly_rsi': h.weekly_rsi,
                'daily_rsi': h.daily_rsi,
                'triggers': h.triggers,
                'note': h.note,
            }
            for h in hits
        ],
    }


@app.get('/', response_class=HTMLResponse)
def dashboard(request: Request):
    if not angel_client.is_connected():
        angel_client.connect()

    performers = analysis_service.top_performers()
    bundle = analysis_service.suggestions(performers)

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
            'suggestions': bundle.suggestions,
            'allow_live': settings.allow_live_trades,
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
def watchlist_add(symbol: str = Form(...), sector: str = Form('Custom')):
    watchlist_service.add_symbol(symbol, sector=sector, source='manual')
    return RedirectResponse('/watchlist', status_code=303)


@app.post('/watchlist/remove')
def watchlist_remove(symbol: str = Form(...)):
    watchlist_service.remove_symbol(symbol)
    return RedirectResponse('/watchlist', status_code=303)


@app.post('/watchlist/seed-defaults')
def watchlist_seed_defaults():
    watchlist_service.seed_sector_defaults(force=True)
    return RedirectResponse('/watchlist', status_code=303)


@app.get('/strategies', response_class=HTMLResponse)
def strategies_page(request: Request):
    symbols = watchlist_service.enabled_symbols()
    hits = strategy_service.scan_rsa_flow(symbols)
    return templates.TemplateResponse(
        request=request,
        name='strategies.html',
        context={
            'app_name': settings.app_name,
            'watchlist_count': len(symbols),
            'hits': hits,
        },
    )


@app.post('/dashboard/mode')
def dashboard_mode(mode: str = Form(...)):
    return set_trade_mode(mode)


@app.post('/dashboard/connect')
def dashboard_connect():
    return connect_session()
