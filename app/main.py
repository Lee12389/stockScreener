from pathlib import Path

from fastapi import FastAPI, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.db import SessionLocal, get_state, init_db, set_state
from app.models import (
    AutomationRequest,
    PaperBotRequest,
    PaperFundRequest,
    PaperTradeRequest,
    SessionStatus,
    TournamentInitRequest,
    TournamentRunRequest,
    TournamentStartRequest,
    TradeRequest,
)
from app.services.analysis import AnalysisService
from app.services.angel_client import AngelClient
from app.services.automation import AutomationService
from app.services.strategy import StrategyService
from app.services.strategy_tournament import StrategyTournamentService
from app.services.trade_engine import TradeEngine
from app.services.watchlist import WatchlistService
from app.services.paper_trader import PaperTraderService

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
paper_trader = PaperTraderService(strategy_service)
tournament_service = StrategyTournamentService(strategy_service)


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


@app.get('/api/paper/summary')
def api_paper_summary() -> dict:
    return paper_trader.summary()


@app.post('/api/paper/fund')
def api_paper_fund(req: PaperFundRequest) -> dict:
    summary = paper_trader.reset_account(req.starting_cash)
    return {'ok': True, 'summary': summary}


@app.post('/api/paper/trade')
def api_paper_trade(req: PaperTradeRequest) -> dict:
    return paper_trader.manual_trade(
        symbol=req.symbol.strip().upper(),
        strategy=req.strategy,
        action=req.action,
        amount=req.amount,
        refresh_signals=req.refresh_signals,
    )


@app.post('/api/paper/auto/start')
def api_paper_auto_start(req: PaperBotRequest) -> dict:
    paper_trader.start_auto(
        strategy=req.strategy,
        interval_minutes=req.interval_minutes,
        max_trades_per_cycle=req.max_trades_per_cycle,
        refresh_signals=req.refresh_signals,
    )
    return {'ok': True, 'message': 'Paper auto-trader started.'}


@app.post('/api/paper/auto/stop')
def api_paper_auto_stop() -> dict:
    paper_trader.stop_auto()
    return {'ok': True, 'message': 'Paper auto-trader stopped.'}


@app.post('/api/tournament/init')
def api_tournament_init(req: TournamentInitRequest) -> dict:
    board = tournament_service.setup_bots(capital=req.starting_capital)
    return {'ok': True, 'leaderboard': board}


@app.post('/api/tournament/start')
def api_tournament_start(req: TournamentStartRequest) -> dict:
    tournament_service.start(interval_seconds=req.interval_seconds, refresh_signals=req.refresh_signals)
    return {'ok': True, 'message': 'Tournament auto-run started.'}


@app.post('/api/tournament/stop')
def api_tournament_stop() -> dict:
    tournament_service.stop()
    return {'ok': True, 'message': 'Tournament auto-run stopped.'}


@app.post('/api/tournament/run-once')
def api_tournament_run_once(req: TournamentRunRequest) -> dict:
    return tournament_service.run_once(refresh_signals=req.refresh_signals)


@app.get('/api/tournament/leaderboard')
def api_tournament_leaderboard() -> dict:
    return tournament_service.leaderboard()


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


@app.get('/api/strategies/scan')
def api_strategy_scan(
    strategy: str = Query(default='rsi'),
    sector: str = Query(default='all'),
    trigger: str = Query(default='all'),
    signal: str = Query(default='all'),
    min_change_pct: float = Query(default=-100.0),
    min_daily_rsi: float = Query(default=0.0),
    limit: int = Query(default=10, ge=1, le=500),
    refresh: bool = Query(default=False),
) -> dict:
    rows, error, _ = _get_strategy_rows(strategy, refresh)
    if error:
        return {'count': 0, 'hits': [], 'error': error}

    filtered = _filter_rows(rows, sector, trigger, signal, min_change_pct, min_daily_rsi)
    filtered = filtered[:limit]
    return {'count': len(filtered), 'hits': filtered}


@app.get('/api/strategies/rsa-scan')
def api_strategy_scan_compat(
    sector: str = Query(default='all'),
    trigger: str = Query(default='all'),
    min_change_pct: float = Query(default=-100.0),
    min_daily_rsi: float = Query(default=0.0),
    limit: int = Query(default=10, ge=1, le=500),
    refresh: bool = Query(default=False),
) -> dict:
    return api_strategy_scan(
        strategy='rsi',
        sector=sector,
        trigger=trigger,
        signal='all',
        min_change_pct=min_change_pct,
        min_daily_rsi=min_daily_rsi,
        limit=limit,
        refresh=refresh,
    )


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


@app.get('/paper', response_class=HTMLResponse)
def paper_page(request: Request):
    summary = paper_trader.summary()
    return templates.TemplateResponse(
        request=request,
        name='paper.html',
        context={'app_name': settings.app_name, 'summary': summary},
    )


@app.get('/tournament', response_class=HTMLResponse)
def tournament_page(request: Request):
    board = tournament_service.leaderboard()
    return templates.TemplateResponse(
        request=request,
        name='tournament.html',
        context={'app_name': settings.app_name, 'board': board},
    )


@app.post('/paper/fund')
def paper_fund(starting_cash: float = Form(...)):
    paper_trader.reset_account(starting_cash)
    return RedirectResponse('/paper', status_code=303)


@app.post('/paper/manual')
def paper_manual(
    symbol: str = Form(...),
    strategy: str = Form('merged'),
    action: str = Form('AUTO'),
    amount: float = Form(0.0),
    refresh_signals: bool = Form(False),
):
    paper_trader.manual_trade(
        symbol=symbol.strip().upper(),
        strategy=strategy,
        action=action,
        amount=amount,
        refresh_signals=refresh_signals,
    )
    return RedirectResponse('/paper', status_code=303)


@app.post('/paper/auto/start')
def paper_auto_start(
    strategy: str = Form('merged'),
    interval_minutes: int = Form(15),
    max_trades_per_cycle: int = Form(3),
    refresh_signals: bool = Form(True),
):
    paper_trader.start_auto(
        strategy=strategy,
        interval_minutes=interval_minutes,
        max_trades_per_cycle=max_trades_per_cycle,
        refresh_signals=refresh_signals,
    )
    return RedirectResponse('/paper', status_code=303)


@app.post('/paper/auto/stop')
def paper_auto_stop():
    paper_trader.stop_auto()
    return RedirectResponse('/paper', status_code=303)


@app.post('/tournament/init')
def tournament_init(starting_capital: float = Form(...)):
    tournament_service.setup_bots(capital=starting_capital)
    return RedirectResponse('/tournament', status_code=303)


@app.post('/tournament/run-once')
def tournament_run_once(refresh_signals: bool = Form(True)):
    tournament_service.run_once(refresh_signals=refresh_signals)
    return RedirectResponse('/tournament', status_code=303)


@app.post('/tournament/start')
def tournament_start(interval_seconds: int = Form(60), refresh_signals: bool = Form(True)):
    tournament_service.start(interval_seconds=interval_seconds, refresh_signals=refresh_signals)
    return RedirectResponse('/tournament', status_code=303)


@app.post('/tournament/stop')
def tournament_stop():
    tournament_service.stop()
    return RedirectResponse('/tournament', status_code=303)


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
    strategy: str = Query(default='rsi'),
    sector: str = Query(default='all'),
    trigger: str = Query(default='all'),
    signal: str = Query(default='all'),
    min_change_pct: float = Query(default=-100.0),
    min_daily_rsi: float = Query(default=0.0),
    limit: int = Query(default=10),
    refresh: bool = Query(default=False),
):
    rows, error, sectors = _get_strategy_rows(strategy, refresh)
    filtered = _filter_rows(rows, sector, trigger, signal, min_change_pct, min_daily_rsi)
    filtered = filtered[: max(1, min(limit, 500))]

    return templates.TemplateResponse(
        request=request,
        name='strategies.html',
        context={
            'app_name': settings.app_name,
            'watchlist_count': len(watchlist_service.enabled_items()),
            'hits': filtered,
            'all_hits_count': len(rows),
            'error': error,
            'sectors': sectors,
            'filters': {
                'strategy': strategy,
                'sector': sector,
                'trigger': trigger,
                'signal': signal,
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


def _get_strategy_rows(strategy: str, refresh: bool):
    strategy = (strategy or 'rsi').lower().strip()
    if strategy == 'supertrend':
        hits, error = strategy_service.scan_supertrend(force_refresh=refresh)
        rows = [
            {
                'symbol': h.symbol,
                'sector': h.sector,
                'change_pct': h.change_pct,
                'monthly_rsi': None,
                'weekly_rsi': None,
                'daily_rsi': None,
                'triggers': [],
                'stop_loss': None,
                'targets': [],
                'support': h.support,
                'resistance': h.resistance,
                'supertrend': h.supertrend,
                'signal': h.signal,
                'sparkline': h.sparkline,
                'note': h.note,
            }
            for h in hits
        ]
    elif strategy == 'merged':
        hits, error = strategy_service.scan_merged(force_refresh=refresh)
        rows = [
            {
                'symbol': h.symbol,
                'sector': h.sector,
                'change_pct': h.change_pct,
                'monthly_rsi': h.monthly_rsi,
                'weekly_rsi': h.weekly_rsi,
                'daily_rsi': h.daily_rsi,
                'triggers': h.triggers,
                'stop_loss': h.stop_loss,
                'targets': h.targets,
                'support': h.support,
                'resistance': h.resistance,
                'supertrend': h.supertrend,
                'signal': h.signal,
                'sparkline': h.sparkline,
                'note': h.note,
            }
            for h in hits
        ]
    else:
        hits, error = strategy_service.scan_rsa_flow(force_refresh=refresh)
        rows = [
            {
                'symbol': h.symbol,
                'sector': h.sector,
                'change_pct': h.change_pct,
                'monthly_rsi': h.monthly_rsi,
                'weekly_rsi': h.weekly_rsi,
                'daily_rsi': h.daily_rsi,
                'triggers': h.triggers,
                'stop_loss': h.stop_loss,
                'targets': h.targets,
                'support': None,
                'resistance': None,
                'supertrend': None,
                'signal': h.action,
                'sparkline': h.sparkline,
                'note': h.note,
            }
            for h in hits
        ]

    sectors = sorted({r['sector'] for r in rows})
    return rows, error, sectors


def _filter_rows(rows, sector: str, trigger: str, signal: str, min_change_pct: float, min_daily_rsi: float):
    out = []
    for r in rows:
        if sector != 'all' and r.get('sector') != sector:
            continue
        if trigger != 'all' and trigger not in r.get('triggers', []):
            continue
        if signal != 'all' and r.get('signal') != signal:
            continue
        if (r.get('change_pct') or 0.0) < min_change_pct:
            continue
        daily = r.get('daily_rsi')
        if daily is not None and daily < min_daily_rsi:
            continue
        out.append(r)
    return out
