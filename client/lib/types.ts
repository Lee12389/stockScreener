export type TradeMode = 'paper' | 'live';
export type StrategyKind = 'rsi' | 'supertrend' | 'merged';
export type ScannerInterval =
  | 'FIVE_MINUTE'
  | 'FIFTEEN_MINUTE'
  | 'ONE_HOUR'
  | 'ONE_DAY'
  | 'ONE_WEEK'
  | 'ONE_MONTH';

export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SessionStatus {
  connected: boolean;
  message: string;
}

export interface DashboardSummary {
  app_name: string;
  connected: boolean;
  mode: TradeMode;
  allow_live: boolean;
  watchlist_count: number;
  performers: Performer[];
  suggestions: Suggestion[];
  info_message: string;
}

export interface Performer {
  symbol: string;
  last_price?: number | null;
  change_pct?: number | null;
}

export interface Suggestion {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
}

export interface WatchlistItem {
  symbol: string;
  exchange: string;
  symbol_token?: string | null;
  sector: string;
  source: string;
  enabled: string;
}

export interface StrategyScanResponse {
  count: number;
  error?: string | null;
  hits: StrategyHit[];
}

export interface StrategyHit {
  symbol: string;
  sector?: string;
  change_pct?: number;
  monthly_rsi?: number | null;
  weekly_rsi?: number | null;
  daily_rsi?: number | null;
  stop_loss?: number | null;
  targets?: number[] | null;
  support?: number | null;
  resistance?: number | null;
  signal: string;
  triggers?: string[];
  sparkline?: string;
  note?: string;
  trend?: string;
}

export interface ScannerConfig {
  include_nifty50: string | boolean;
  include_midcap150: string | boolean;
  include_nifty500: string | boolean;
  scan_interval: ScannerInterval;
  use_weekly_monthly: string | boolean;
  volume_multiplier: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  show_ema: string | boolean;
  show_rsi: string | boolean;
  show_macd: string | boolean;
  show_supertrend: string | boolean;
  show_volume: string | boolean;
  show_sr: string | boolean;
}

export interface BoughtInfo {
  symbol: string;
  exchange: string;
  entry_price: number;
  quantity: number;
  note: string;
}

export interface ScannerDatasetItem {
  symbol: string;
  exchange: string;
  sector: string;
  source?: string;
  symbol_token?: string;
  interval: ScannerInterval;
  candles: Candle[];
  daily_candles: Candle[];
}

export interface ScannerDatasetResponse {
  error?: string | null;
  items: ScannerDatasetItem[];
  count: number;
  config: ScannerConfig;
  bought: BoughtInfo[];
  generated_at: string;
  scope_symbols: string[];
}

export interface MonitorItem {
  symbol: string;
  entry_price: number;
  quantity: number;
  ltp: number;
  pnl: number;
  state: string;
  color?: string;
  reasons: string[];
  note?: string;
  sparkline?: string;
}

export interface MonitorResponse {
  error?: string | null;
  count: number;
  items: MonitorItem[];
  config?: ScannerConfig;
}

export interface PaperPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  avg_price: number;
  ltp: number;
  unrealized_pnl: number;
  strategy: string;
}

export interface PaperTrade {
  time: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  value: number;
  realized_pnl: number;
  strategy: string;
  signal: string;
  note?: string;
  balance_after: number;
}

export interface PaperSummary {
  starting_cash: number;
  cash_balance: number;
  equity: number;
  realized_pnl: number;
  total_pnl: number;
  auto_running?: boolean;
  auto_jobs?: string[];
  positions: PaperPosition[];
  trades: PaperTrade[];
}

export interface TournamentBot {
  bot_id: number;
  name: string;
  strategy: string;
  starting_capital: number;
  cash_balance: number;
  equity: number;
  realized_pnl: number;
  return_pct: number;
  trades_count: number;
  wins_count: number;
  losses_count: number;
  win_rate_pct: number;
  max_drawdown_pct: number;
  status: string;
  last_run_at?: string | null;
}

export interface TournamentTrade {
  time: string;
  bot_id: number;
  symbol: string;
  instrument: string;
  side: string;
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
  win: string;
  reason: string;
  signal_score: number;
}

export interface TournamentBoard {
  running?: boolean;
  jobs?: string[];
  bots: TournamentBot[];
  recent_trades: TournamentTrade[];
}

export interface OptionsResponse {
  [key: string]: unknown;
}

export type PresetKey =
  | 'all'
  | 'quality_momentum'
  | 'momentum_breakout'
  | 'trend_pullback'
  | 'relative_strength'
  | 'vwap_reclaim'
  | 'supertrend_continuation'
  | 'volume_breakout'
  | 'squeeze_breakout'
  | 'support_bounce'
  | 'mean_reversion'
  | 'reversal_sell';

export interface ScannerRow {
  symbol: string;
  exchange: string;
  sector: string;
  intervalLabel: string;
  close: number;
  changePct: number;
  dailyRsi: number;
  weeklyRsi: number;
  monthlyRsi: number;
  primaryRsi: number;
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  superSignal: string;
  volumeRatio: number;
  adx: number;
  stochK: number;
  stochD: number;
  atr: number;
  atrPct: number;
  support: number;
  resistance: number;
  high52w: number;
  low52w: number;
  bbUpper: number;
  bbLower: number;
  bbWidth: number;
  vwap: number;
  score: number;
  signal: string;
  reasons: string[];
  scans: string[];
  trendBias: 'bullish' | 'bearish' | 'neutral';
  trendLabel: string;
  levelContext: string;
  flags: Record<string, boolean>;
  isBought: boolean;
  bought?: BoughtInfo | null;
  boughtState: string;
  boughtReasons: string[];
  candles: Candle[];
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  monthlyCandles: Candle[];
  sparklineValues: number[];
}
