import {
  DashboardSummary,
  MonitorResponse,
  OptionsResponse,
  PaperSummary,
  ScannerConfig,
  ScannerDatasetResponse,
  SessionStatus,
  StrategyKind,
  StrategyScanResponse,
  TournamentBoard,
  TradeMode,
  WatchlistItem,
} from '@/lib/types';

type RequestInitWithJson = RequestInit & {
  json?: unknown;
};

async function request<T>(baseUrl: string, path: string, init: RequestInitWithJson = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const finalInit: RequestInit = {
    ...init,
    headers,
  };

  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    finalInit.body = JSON.stringify(init.json);
  }

  const response = await fetch(`${baseUrl}${path}`, finalInit);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'detail' in data && String((data as Record<string, unknown>).detail)) ||
      response.statusText ||
      'Request failed.';
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  health(baseUrl: string) {
    return request<{ status: string; app: string }>(baseUrl, '/api/health');
  },
  dashboardSummary(baseUrl: string, refresh = false) {
    return request<DashboardSummary>(baseUrl, `/api/dashboard/summary?refresh=${refresh ? 'true' : 'false'}`);
  },
  connectSession(baseUrl: string) {
    return request<SessionStatus>(baseUrl, '/api/session/connect', { method: 'POST' });
  },
  getTradeMode(baseUrl: string) {
    return request<{ mode: TradeMode; allow_live: boolean }>(baseUrl, '/api/trade/mode');
  },
  setTradeMode(baseUrl: string, mode: TradeMode) {
    return request<{ ok: boolean; mode: TradeMode }>(baseUrl, `/api/trade/mode/${mode}`, { method: 'POST' });
  },
  watchlist(baseUrl: string) {
    return request<WatchlistItem[]>(baseUrl, '/api/watchlist');
  },
  addWatchlist(baseUrl: string, payload: { symbol: string; exchange: string; symbol_token?: string; sector: string }) {
    return request<{ ok: boolean; items: WatchlistItem[] }>(baseUrl, '/api/watchlist/add', {
      method: 'POST',
      json: payload,
    });
  },
  removeWatchlist(baseUrl: string, symbol: string) {
    return request<{ ok: boolean; items: WatchlistItem[] }>(baseUrl, '/api/watchlist/remove', {
      method: 'POST',
      json: { symbol },
    });
  },
  toggleWatchlist(baseUrl: string, symbol: string, enabled: boolean) {
    return request<{ ok: boolean; items: WatchlistItem[] }>(baseUrl, '/api/watchlist/toggle', {
      method: 'POST',
      json: { symbol, enabled },
    });
  },
  seedWatchlist(baseUrl: string) {
    return request<{ ok: boolean; inserted: number; items: WatchlistItem[] }>(baseUrl, '/api/watchlist/seed-defaults', {
      method: 'POST',
    });
  },
  strategyScan(baseUrl: string, params: URLSearchParams) {
    return request<StrategyScanResponse>(baseUrl, `/api/strategies/scan?${params.toString()}`);
  },
  paperSummary(baseUrl: string) {
    return request<PaperSummary>(baseUrl, '/api/paper/summary');
  },
  resetPaperFund(baseUrl: string, starting_cash: number) {
    return request<{ ok: boolean; summary: PaperSummary }>(baseUrl, '/api/paper/fund', {
      method: 'POST',
      json: { starting_cash },
    });
  },
  paperTrade(baseUrl: string, payload: { symbol: string; strategy: StrategyKind; action: string; amount: number; refresh_signals: boolean }) {
    return request<Record<string, unknown>>(baseUrl, '/api/paper/trade', {
      method: 'POST',
      json: payload,
    });
  },
  startPaperAuto(baseUrl: string, payload: { strategy: StrategyKind; interval_minutes: number; max_trades_per_cycle: number; refresh_signals: boolean }) {
    return request<{ ok: boolean; message: string }>(baseUrl, '/api/paper/auto/start', {
      method: 'POST',
      json: payload,
    });
  },
  stopPaperAuto(baseUrl: string) {
    return request<{ ok: boolean; message: string }>(baseUrl, '/api/paper/auto/stop', { method: 'POST' });
  },
  scannerConfig(baseUrl: string) {
    return request<ScannerConfig>(baseUrl, '/api/scanner/config');
  },
  updateScannerConfig(baseUrl: string, payload: ScannerConfig) {
    return request<ScannerConfig>(baseUrl, '/api/scanner/config', { method: 'POST', json: payload });
  },
  scannerDataset(baseUrl: string, opts: { refresh?: boolean; symbols?: string[] } = {}) {
    const params = new URLSearchParams();
    if (opts.refresh) {
      params.set('refresh', 'true');
    }
    if (opts.symbols && opts.symbols.length) {
      params.set('symbols', opts.symbols.join(','));
    }
    return request<ScannerDatasetResponse>(baseUrl, `/api/scanner/dataset?${params.toString()}`);
  },
  addBought(baseUrl: string, payload: { symbol: string; entry_price: number; quantity: number; note: string }) {
    return request<{ ok: boolean }>(baseUrl, '/api/scanner/bought/add', { method: 'POST', json: payload });
  },
  removeBought(baseUrl: string, symbol: string) {
    const form = new FormData();
    form.append('symbol', symbol);
    return request<{ ok: boolean }>(baseUrl, '/api/scanner/bought/remove', {
      method: 'POST',
      body: form,
    });
  },
  boughtMonitor(baseUrl: string, refresh = false) {
    return request<MonitorResponse>(baseUrl, `/api/scanner/bought/monitor?refresh=${refresh ? 'true' : 'false'}`);
  },
  tournamentLeaderboard(baseUrl: string) {
    return request<TournamentBoard>(baseUrl, '/api/tournament/leaderboard');
  },
  tournamentInit(baseUrl: string, starting_capital: number) {
    return request<{ ok: boolean; leaderboard: TournamentBoard }>(baseUrl, '/api/tournament/init', {
      method: 'POST',
      json: { starting_capital },
    });
  },
  tournamentRunOnce(baseUrl: string, refresh_signals: boolean) {
    return request<Record<string, unknown>>(baseUrl, '/api/tournament/run-once', {
      method: 'POST',
      json: { refresh_signals },
    });
  },
  tournamentStart(baseUrl: string, interval_seconds: number, refresh_signals: boolean) {
    return request<{ ok: boolean; message: string }>(baseUrl, '/api/tournament/start', {
      method: 'POST',
      json: { interval_seconds, refresh_signals },
    });
  },
  tournamentStop(baseUrl: string) {
    return request<{ ok: boolean; message: string }>(baseUrl, '/api/tournament/stop', { method: 'POST' });
  },
  optionsRecommend(baseUrl: string, payload: { spot: number; capital: number; option_rows_csv: string }) {
    return request<OptionsResponse>(baseUrl, '/api/options/recommend', {
      method: 'POST',
      json: payload,
    });
  },
  optionsCustom(baseUrl: string, payload: { spot: number; capital: number; option_rows_csv: string; legs_csv: string; lot_size: number }) {
    return request<OptionsResponse>(baseUrl, '/api/options/custom', {
      method: 'POST',
      json: payload,
    });
  },
};
