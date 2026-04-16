from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.db import SessionLocal, get_state, init_db, set_state
from app.models import AutomationRequest, SessionStatus, TradeRequest
from app.services.analysis import AnalysisService
from app.services.angel_client import AngelClient
from app.services.automation import AutomationService
from app.services.trade_engine import TradeEngine

settings = get_settings()
app = FastAPI(title=settings.app_name)

base_dir = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(base_dir / 'templates'))
app.mount('/static', StaticFiles(directory=str(base_dir / 'static')), name='static')

angel_client = AngelClient()
analysis_service = AnalysisService(angel_client)
trade_engine = TradeEngine(angel_client)
automation_service = AutomationService(analysis_service, trade_engine)


@app.on_event('startup')
def startup() -> None:
    init_db()
    with SessionLocal() as session:
        get_state(session, 'trade_mode', settings.default_mode)


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


@app.post('/dashboard/mode')
def dashboard_mode(mode: str = Form(...)):
    return set_trade_mode(mode)


@app.post('/dashboard/connect')
def dashboard_connect():
    return connect_session()
