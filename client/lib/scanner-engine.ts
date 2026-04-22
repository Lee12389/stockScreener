import { BoughtInfo, Candle, PresetKey, ScannerConfig, ScannerDatasetItem, ScannerRow } from '@/lib/types';

export const PRESET_LABELS: Record<PresetKey, string> = {
  all: 'All',
  quality_momentum: 'Quality Momentum',
  momentum_breakout: 'Momentum Breakout',
  trend_pullback: 'Trend Pullback',
  relative_strength: 'Relative Strength',
  vwap_reclaim: 'VWAP Reclaim',
  supertrend_continuation: 'Supertrend',
  volume_breakout: 'Volume Breakout',
  squeeze_breakout: 'BB Squeeze',
  support_bounce: 'Support Bounce',
  mean_reversion: 'Mean Reversion',
  reversal_sell: 'Reversal Sell',
};

export type ChartTimeframe = 'primary' | 'daily' | 'weekly' | 'monthly';

/** Converts raw dataset items into ranked scanner rows for the UI. */
export function buildScannerRows(items: ScannerDatasetItem[], config: ScannerConfig, boughtRows: BoughtInfo[] = []): ScannerRow[] {
  const boughtMap = new Map(boughtRows.map((row) => [row.symbol.toUpperCase(), row]));
  return items
    .map((item) => buildRowSummary(item, config, boughtMap.get(item.symbol.toUpperCase()) || null))
    .sort((left, right) => right.score - left.score);
}

/** Reports whether a scanner row matches the selected preset bucket. */
export function matchesPreset(row: ScannerRow, preset: PresetKey) {
  if (preset === 'all') {
    return true;
  }
  return row.scans.includes(PRESET_LABELS[preset]);
}

/** Formats backend interval constants into human-friendly labels. */
export function intervalLabelFor(value: string): string {
  const labels: Record<string, string> = {
    FIVE_MINUTE: '5m',
    FIFTEEN_MINUTE: '15m',
    ONE_HOUR: '1h',
    ONE_DAY: '1D',
    ONE_WEEK: '1W',
    ONE_MONTH: '1M',
  };
  return labels[(value || '').toUpperCase()] || value || '15m';
}

/** Builds the candle and moving-average series used in detail charts. */
export function buildChartSeries(row: ScannerRow, timeframe: ChartTimeframe = 'primary') {
  let candles = row.candles;
  if (timeframe === 'daily') {
    candles = row.dailyCandles;
  } else if (timeframe === 'weekly') {
    candles = row.weeklyCandles;
  } else if (timeframe === 'monthly') {
    candles = row.monthlyCandles;
  }

  const closes = candles.map((candle) => candle.close);
  return {
    title:
      timeframe === 'daily'
        ? 'Daily'
        : timeframe === 'weekly'
          ? 'Weekly'
          : timeframe === 'monthly'
            ? 'Monthly'
            : row.intervalLabel,
    candles,
    close: closes,
    ema20: emaSeries(closes, 20),
    ema50: emaSeries(closes, 50),
    ema200: emaSeries(closes, 200),
    support: row.support,
    resistance: row.resistance,
  };
}

/** Calculates all derived scanner metrics for one dataset item. */
function buildRowSummary(item: ScannerDatasetItem, config: ScannerConfig, boughtInfo: BoughtInfo | null): ScannerRow {
  const candles = normalizeCandles(item.candles || []);
  const dailyCandles = normalizeCandles((item.daily_candles && item.daily_candles.length ? item.daily_candles : item.candles) || []);
  const weeklyCandles = aggregateCandlesByBucket(dailyCandles, 'week');
  const monthlyCandles = aggregateCandlesByBucket(dailyCandles, 'month');
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);
  const dailyCloses = dailyCandles.map((candle) => candle.close);
  const dailyHighs = dailyCandles.map((candle) => candle.high);
  const dailyLows = dailyCandles.map((candle) => candle.low);

  const ema20SeriesData = emaSeries(closes, 20);
  const ema50SeriesData = emaSeries(closes, 50);
  const ema100SeriesData = emaSeries(closes, 100);
  const ema200SeriesData = emaSeries(closes, 200);
  const sma50SeriesData = smaSeries(closes, 50);
  const sma200SeriesData = smaSeries(closes, 200);
  const primaryRsiSeries = rsiSeries(closes, 14);
  const dailyRsiSeries = rsiSeries(dailyCloses, 14);
  const weeklyRsiSeries = rsiSeries(aggregateCloseByBucket(dailyCandles, 'week'), 14);
  const monthlyRsiSeries = rsiSeries(aggregateCloseByBucket(dailyCandles, 'month'), 14);
  const macdSeriesSet = macdSeries(
    closes,
    safeNumber(config.macd_fast, 12),
    safeNumber(config.macd_slow, 26),
    safeNumber(config.macd_signal, 9)
  );
  const atrValues = atrSeries(highs, lows, closes, 14);
  const adxValues = adxSeries(highs, lows, closes, 14);
  const stochasticValues = stochasticSeries(highs, lows, closes, 14, 3);
  const bollingerValues = bollingerSeries(closes, 20, 2);
  const supertrendValues = supertrendSeries(highs, lows, closes, 10, 3);
  const vwapValues = vwapSeries(candles);

  const close = lastNumber(closes);
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : close;
  const changePct = percentChange(close, prevClose);
  const ema20 = lastNumber(ema20SeriesData);
  const ema50 = lastNumber(ema50SeriesData);
  const ema100 = lastNumber(ema100SeriesData);
  const ema200 = lastNumber(ema200SeriesData);
  const sma50 = lastNumber(sma50SeriesData);
  const sma200 = lastNumber(sma200SeriesData);
  const primaryRsi = lastNumber(primaryRsiSeries, 50);
  const prevPrimaryRsi = lastNumber(primaryRsiSeries.slice(0, -1), primaryRsi);
  const dailyRsi = lastNumber(dailyRsiSeries, primaryRsi);
  const prevDailyRsi = lastNumber(dailyRsiSeries.slice(0, -1), dailyRsi);
  const weeklyRsi = lastNumber(weeklyRsiSeries, dailyRsi);
  const monthlyRsi = lastNumber(monthlyRsiSeries, dailyRsi);
  const macd = lastNumber(macdSeriesSet.macd);
  const macdSignal = lastNumber(macdSeriesSet.signal);
  const prevMacd = lastNumber(macdSeriesSet.macd.slice(0, -1), macd);
  const prevMacdSignal = lastNumber(macdSeriesSet.signal.slice(0, -1), macdSignal);
  const macdHist = lastNumber(macdSeriesSet.hist);
  const prevMacdHist = lastNumber(macdSeriesSet.hist.slice(0, -1), macdHist);
  const atr = lastNumber(atrValues);
  const adx = lastNumber(adxValues, 10);
  const stochK = lastNumber(stochasticValues.k, 50);
  const stochD = lastNumber(stochasticValues.d, 50);
  const currentVolume = lastNumber(volumes, 0);
  const avgVolume = average(volumes.slice(-21, -1));
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  const support = minValue(lows.slice(-21, -1), close);
  const resistance = maxValue(highs.slice(-21, -1), close);
  const high52w = maxValue(dailyHighs.slice(-252), close);
  const low52w = minValue(dailyLows.slice(-252), close);
  const bbUpper = lastNumber(bollingerValues.upper, close);
  const bbLower = lastNumber(bollingerValues.lower, close);
  const bbMiddle = lastNumber(bollingerValues.middle, close);
  const bbWidth = bbMiddle ? ((bbUpper - bbLower) / bbMiddle) * 100 : 0;
  const avgBbWidth = average(bollingerValues.width.slice(-20));
  const superValue = lastNumber(supertrendValues.line, close);
  const superBull = Boolean(last(supertrendValues.bullish));
  const vwap = lastNumber(vwapValues, close);
  const atrPct = close ? (atr / close) * 100 : 0;

  const flags = {
    emaStackBull: close > ema20 && ema20 > ema50 && ema50 > ema200,
    emaStackBear: close < ema20 && ema20 < ema50 && ema50 < ema200,
    macdBullCross: prevMacd <= prevMacdSignal && macd > macdSignal,
    macdBearCross: prevMacd >= prevMacdSignal && macd < macdSignal,
    rsiReclaim: (prevDailyRsi < 50 && dailyRsi >= 50) || (prevPrimaryRsi < 50 && primaryRsi >= 50),
    superBull,
    nearBreakout: close >= resistance * 0.995,
    nearSupport: close <= support * 1.02,
    near52wHigh: close >= high52w * 0.98,
    goldenCross:
      lastNumber(sma50SeriesData.slice(0, -1), sma50) <= lastNumber(sma200SeriesData.slice(0, -1), sma200) &&
      sma50 > sma200,
    volumeBreakout: volumeRatio >= Math.max(1.2, safeNumber(config.volume_multiplier, 1.5)),
    trendPullback: close > ema50 && close <= ema20 * 1.015 && close >= ema20 * 0.985,
    squeezeBreakout: bbWidth > 0 && avgBbWidth > 0 && bbWidth <= avgBbWidth * 0.75 && close >= bbUpper * 0.995,
    supportBounce: close > support && close <= support * 1.02 && volumeRatio >= 1.1 && macd > macdSignal,
    meanReversion: dailyRsi <= 38 && close <= bbLower * 1.01 && macdHist >= prevMacdHist,
    vwapReclaim:
      closes.length > 1 &&
      closes[closes.length - 2] < lastNumber(vwapValues.slice(0, -1), vwap) &&
      close > vwap &&
      volumeRatio >= 1.2,
    relativeStrengthLeader: close >= high52w * 0.985 && close > ema50 && weeklyRsi >= 55 && monthlyRsi >= 55,
    bearishReversal: (prevMacd >= prevMacdSignal && macd < macdSignal) || (close < ema20 && ema20 < ema50) || !superBull,
  };

  let score = 34;
  const reasons: string[] = [];
  if (flags.emaStackBull) {
    score += 16;
    reasons.push('EMA stack is bullish (20 > 50 > 200).');
  }
  if (dailyRsi >= 60) {
    score += 12;
    reasons.push('Daily RSI is in the power zone.');
  } else if (dailyRsi >= 52) {
    score += 7;
  } else if (dailyRsi < 45) {
    score -= 8;
  }
  if (weeklyRsi >= 55) {
    score += 8;
  }
  if (monthlyRsi >= 55) {
    score += 6;
  }
  if (flags.macdBullCross) {
    score += 10;
    reasons.push('MACD bullish crossover is active.');
  } else if (flags.macdBearCross) {
    score -= 11;
  }
  if (flags.superBull) {
    score += 8;
    reasons.push('Supertrend remains bullish.');
  } else {
    score -= 8;
  }
  if (flags.volumeBreakout) {
    score += 12;
    reasons.push('Volume expansion confirms the move.');
  }
  if (flags.nearBreakout) {
    score += 10;
    reasons.push('Price is pressing prior resistance.');
  }
  if (flags.near52wHigh) {
    score += 8;
  }
  if (flags.relativeStrengthLeader) {
    score += 8;
    reasons.push('Relative strength is holding near 52W highs.');
  }
  if (adx >= 20) {
    score += 8;
    reasons.push('ADX shows trend strength.');
  }
  if (stochK >= stochD && stochK >= 55) {
    score += 4;
  } else if (stochK < stochD && stochK <= 45) {
    score -= 4;
  }
  if (flags.trendPullback) {
    score += 6;
    reasons.push('Pullback is holding near EMA20 in an uptrend.');
  }
  if (flags.squeezeBreakout) {
    score += 7;
    reasons.push('Bollinger squeeze is expanding.');
  }
  if (flags.supportBounce) {
    score += 7;
    reasons.push('Support bounce is developing with volume.');
  }
  if (flags.vwapReclaim) {
    score += 5;
    reasons.push('VWAP reclaim is holding with better participation.');
  }
  if (flags.goldenCross) {
    score += 6;
  }
  if (flags.meanReversion) {
    score += 4;
  }
  if (flags.emaStackBear) {
    score -= 14;
    reasons.push('EMA stack is bearish.');
  }
  if (flags.bearishReversal) {
    score -= 10;
  }
  score = clamp(Math.round(score), 0, 100);

  const scans: string[] = [];
  if (score >= 58 && weeklyRsi >= 50 && monthlyRsi >= 50) scans.push(PRESET_LABELS.quality_momentum);
  if (flags.nearBreakout && flags.volumeBreakout && flags.macdBullCross && dailyRsi >= 55) scans.push(PRESET_LABELS.momentum_breakout);
  if (flags.trendPullback && flags.emaStackBull && dailyRsi >= 50) scans.push(PRESET_LABELS.trend_pullback);
  if (flags.relativeStrengthLeader) scans.push(PRESET_LABELS.relative_strength);
  if (flags.vwapReclaim && dailyRsi >= 50) scans.push(PRESET_LABELS.vwap_reclaim);
  if (flags.superBull && adx >= 20) scans.push(PRESET_LABELS.supertrend_continuation);
  if (flags.volumeBreakout && changePct > 0.5) scans.push(PRESET_LABELS.volume_breakout);
  if (flags.squeezeBreakout) scans.push(PRESET_LABELS.squeeze_breakout);
  if (flags.supportBounce) scans.push(PRESET_LABELS.support_bounce);
  if (flags.meanReversion) scans.push(PRESET_LABELS.mean_reversion);
  if (flags.bearishReversal) scans.push(PRESET_LABELS.reversal_sell);

  let signal = 'IGNORE';
  if (score >= 75) signal = 'STRONG_BUY';
  else if (score >= 62) signal = 'BUY';
  else if (score >= 48) signal = 'WATCH';
  else if (flags.bearishReversal && score <= 30) signal = 'STRONG_SELL';
  else if (flags.bearishReversal && score <= 42) signal = 'SELL';

  const trendBias = flags.emaStackBull ? 'bullish' : flags.emaStackBear ? 'bearish' : 'neutral';
  const trendLabel = flags.emaStackBull ? 'Bullish stack' : flags.emaStackBear ? 'Bearish stack' : 'Mixed';
  const levelContext = flags.nearBreakout
    ? 'Near breakout'
    : flags.nearSupport
      ? 'Near support'
      : flags.near52wHigh
        ? 'Near 52W high'
        : 'Inside range';

  const row: ScannerRow = {
    symbol: item.symbol,
    exchange: item.exchange || 'NSE',
    sector: item.sector || 'Unknown',
    intervalLabel: intervalLabelFor(item.interval || 'FIFTEEN_MINUTE'),
    close: roundNumber(close, 2),
    changePct: roundNumber(changePct, 2),
    dailyRsi: roundNumber(dailyRsi, 2),
    weeklyRsi: roundNumber(weeklyRsi, 2),
    monthlyRsi: roundNumber(monthlyRsi, 2),
    primaryRsi: roundNumber(primaryRsi, 2),
    ema20: roundNumber(ema20, 2),
    ema50: roundNumber(ema50, 2),
    ema100: roundNumber(ema100, 2),
    ema200: roundNumber(ema200, 2),
    macd: roundNumber(macd, 3),
    macdSignal: roundNumber(macdSignal, 3),
    macdHist: roundNumber(macdHist, 3),
    superSignal: superBull ? (flags.nearBreakout ? 'STRONG_BUY' : 'BUY') : flags.nearSupport ? 'STRONG_SELL' : 'SELL',
    volumeRatio: roundNumber(volumeRatio, 2),
    adx: roundNumber(adx, 2),
    stochK: roundNumber(stochK, 2),
    stochD: roundNumber(stochD, 2),
    atr: roundNumber(atr, 2),
    atrPct: roundNumber(atrPct, 2),
    support: roundNumber(support, 2),
    resistance: roundNumber(resistance, 2),
    high52w: roundNumber(high52w, 2),
    low52w: roundNumber(low52w, 2),
    bbUpper: roundNumber(bbUpper, 2),
    bbLower: roundNumber(bbLower, 2),
    bbWidth: roundNumber(bbWidth, 2),
    vwap: roundNumber(vwap, 2),
    score,
    signal,
    reasons,
    scans,
    trendBias,
    trendLabel,
    levelContext,
    flags,
    isBought: Boolean(boughtInfo),
    bought: boughtInfo,
    boughtState: 'HOLD',
    boughtReasons: [],
    candles,
    dailyCandles,
    weeklyCandles,
    monthlyCandles,
    sparklineValues: closes.slice(-48),
  };

  const reversal = evaluateBoughtReversal(row);
  row.boughtState = reversal.state;
  row.boughtReasons = reversal.reasons;

  return row;
}

/** Evaluates a tracked row for weak or strong reversal conditions. */
function evaluateBoughtReversal(row: ScannerRow) {
  if (!row.isBought) {
    return { state: 'NOT_TRACKED', reasons: [] as string[] };
  }

  const reasons: string[] = [];
  let strength = 0;

  if (row.macd < row.macdSignal) {
    strength += 1;
    reasons.push('MACD has rolled below its signal line.');
  }
  if (row.close < row.ema20 && row.ema20 < row.ema50) {
    strength += 1;
    reasons.push('EMA20 lost EMA50 with price below both.');
  }
  if (row.superSignal.includes('SELL')) {
    strength += 1;
    reasons.push('Supertrend has flipped bearish.');
  }
  if (row.dailyRsi < 45) {
    strength += 1;
    reasons.push('Daily RSI is losing momentum.');
  }

  if (strength >= 3) {
    return { state: 'STRONG_SELL', reasons };
  }
  if (strength >= 1) {
    return { state: 'WEAK_SELL', reasons };
  }
  return { state: 'HOLD', reasons: ['Trend is still healthy.'] };
}

/** Coerces candle inputs into a consistently numeric shape. */
function normalizeCandles(candles: Candle[]): Candle[] {
  return (candles || []).map((candle) => ({
    ts: String(candle.ts),
    open: safeNumber(candle.open),
    high: safeNumber(candle.high),
    low: safeNumber(candle.low),
    close: safeNumber(candle.close),
    volume: safeNumber(candle.volume),
  }));
}

/** Safely converts arbitrary values into numbers with a fallback. */
function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Rounds a number to the requested decimal precision. */
function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

/** Clamps a number into the supplied range. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Averages only the finite numeric values in a mixed array. */
function average(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => Number.isFinite(value as number));
  if (!filtered.length) {
    return 0;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

/** Returns the final array element or a fallback when empty. */
function last<T>(values: T[], fallback?: T): T {
  if (!values.length) {
    return fallback as T;
  }
  return values[values.length - 1];
}

/** Returns the last finite numeric value in a series. */
function lastNumber(values: Array<number | null | undefined>, fallback = 0) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (Number.isFinite(value as number)) {
      return Number(value);
    }
  }
  return fallback;
}

/** Returns the maximum finite numeric value in a series. */
function maxValue(values: Array<number | null | undefined>, fallback = 0) {
  const filtered = values.filter((value): value is number => Number.isFinite(value as number));
  return filtered.length ? Math.max(...filtered) : fallback;
}

/** Returns the minimum finite numeric value in a series. */
function minValue(values: Array<number | null | undefined>, fallback = 0) {
  const filtered = values.filter((value): value is number => Number.isFinite(value as number));
  return filtered.length ? Math.min(...filtered) : fallback;
}

/** Calculates percentage change between two prices. */
function percentChange(current: number, previous: number) {
  if (!previous) {
    return 0;
  }
  return ((current - previous) / previous) * 100;
}

/** Parses backend candle timestamps into JavaScript dates. */
function parseDate(value: string): Date | null {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }
  const normalized = value.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Builds the aggregation bucket key for a date and timeframe mode. */
function bucketKeyForDate(date: Date, mode: 'week' | 'month') {
  if (mode === 'week') {
    return isoWeekKey(date);
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Builds an ISO week identifier for weekly aggregation. */
function isoWeekKey(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Aggregates close values into weekly or monthly buckets. */
function aggregateCloseByBucket(candles: Candle[], mode: 'week' | 'month') {
  const buckets = new Map<string, number>();
  candles.forEach((candle) => {
    const date = parseDate(candle.ts);
    if (!date) {
      return;
    }
    buckets.set(bucketKeyForDate(date, mode), candle.close);
  });
  return Array.from(buckets.values());
}

/** Aggregates full candles into weekly or monthly OHLCV buckets. */
function aggregateCandlesByBucket(candles: Candle[], mode: 'week' | 'month') {
  const buckets = new Map<string, Candle>();
  const order: string[] = [];

  candles.forEach((candle) => {
    const date = parseDate(candle.ts);
    if (!date) {
      return;
    }
    const key = bucketKeyForDate(date, mode);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        ts: key,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
      order.push(key);
      return;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  });

  return order.map((key) => buckets.get(key) as Candle);
}

/** Calculates an exponential moving average series. */
function emaSeries(values: number[], period: number) {
  if (!values.length) {
    return [] as number[];
  }
  const alpha = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push((values[index] * alpha) + (output[index - 1] * (1 - alpha)));
  }
  return output;
}

/** Calculates a simple moving average series. */
function smaSeries(values: number[], period: number) {
  const output: Array<number | null> = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) {
      sum -= values[index - period];
    }
    output.push(index >= period - 1 ? sum / period : null);
  }
  return output;
}

/** Calculates an RSI series for the supplied closes. */
function rsiSeries(values: number[], period: number) {
  if (values.length < period + 1) {
    return values.map(() => 50);
  }
  const deltas: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    deltas.push(values[index] - values[index - 1]);
  }
  let avgGain = average(deltas.slice(0, period).map((value) => Math.max(value, 0)));
  let avgLoss = average(deltas.slice(0, period).map((value) => Math.max(-value, 0)));
  const output = new Array(period).fill(50);
  for (let index = period; index < deltas.length; index += 1) {
    const gain = Math.max(deltas[index], 0);
    const loss = Math.max(-deltas[index], 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    if (avgLoss === 0) {
      output.push(100);
    } else {
      const rs = avgGain / avgLoss;
      output.push(100 - 100 / (1 + rs));
    }
  }
  while (output.length < values.length) {
    output.unshift(50);
  }
  return output.slice(-values.length);
}

/** Calculates MACD, signal, and histogram series. */
function macdSeries(values: number[], fast: number, slow: number, signal: number) {
  const fastEma = emaSeries(values, Math.max(2, fast));
  const slowEma = emaSeries(values, Math.max(3, slow));
  const macd = fastEma.map((value, index) => value - slowEma[index]);
  const signalSeries = emaSeries(macd, Math.max(2, signal));
  const hist = macd.map((value, index) => value - signalSeries[index]);
  return { macd, signal: signalSeries, hist };
}

/** Calculates an Average True Range series. */
function atrSeries(highs: number[], lows: number[], closes: number[], period: number) {
  const tr: number[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    if (index === 0) {
      tr.push(highs[index] - lows[index]);
    } else {
      tr.push(
        Math.max(
          highs[index] - lows[index],
          Math.abs(highs[index] - closes[index - 1]),
          Math.abs(lows[index] - closes[index - 1])
        )
      );
    }
  }
  const atr: number[] = [];
  for (let index = 0; index < tr.length; index += 1) {
    if (index === 0) {
      atr.push(tr[index]);
    } else if (index < period) {
      atr.push(average(tr.slice(0, index + 1)));
    } else {
      atr.push(((atr[index - 1] * (period - 1)) + tr[index]) / period);
    }
  }
  return atr;
}

/** Calculates a simplified ADX trend-strength series. */
function adxSeries(highs: number[], lows: number[], closes: number[], period: number) {
  if (closes.length < period + 1) {
    return closes.map(() => 10);
  }
  const plusDm = [0];
  const minusDm = [0];
  for (let index = 1; index < closes.length; index += 1) {
    const upMove = highs[index] - highs[index - 1];
    const downMove = lows[index - 1] - lows[index];
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const atr = atrSeries(highs, lows, closes, period);
  const plusDi: number[] = [];
  const minusDi: number[] = [];
  const dx: number[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    const atrValue = atr[index] || 1;
    const plus = (lastNumber(emaSeries(plusDm.slice(0, index + 1), period), 0) / atrValue) * 100;
    const minus = (lastNumber(emaSeries(minusDm.slice(0, index + 1), period), 0) / atrValue) * 100;
    plusDi.push(plus);
    minusDi.push(minus);
    const denominator = plus + minus;
    dx.push(denominator ? Math.abs((plus - minus) / denominator) * 100 : 0);
  }
  return emaSeries(dx, period);
}

/** Calculates stochastic oscillator K and D series. */
function stochasticSeries(highs: number[], lows: number[], closes: number[], period: number, smooth: number) {
  const k = closes.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const hh = maxValue(highs.slice(start, index + 1), closes[index]);
    const ll = minValue(lows.slice(start, index + 1), closes[index]);
    const span = hh - ll || 1;
    return ((closes[index] - ll) / span) * 100;
  });
  return {
    k,
    d: smaSeries(k, smooth).map((value) => (value == null ? 50 : value)),
  };
}

/** Calculates Bollinger band and width series. */
function bollingerSeries(values: number[], period: number, multiplier: number) {
  const middle = smaSeries(values, period);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  const width: Array<number | null> = [];
  for (let index = 0; index < values.length; index += 1) {
    if (index < period - 1 || middle[index] == null) {
      upper.push(null);
      lower.push(null);
      width.push(null);
      continue;
    }
    const slice = values.slice(index - period + 1, index + 1);
    const avg = middle[index] as number;
    const variance = slice.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(avg + multiplier * std);
    lower.push(avg - multiplier * std);
    width.push(avg ? (((upper[index] as number) - (lower[index] as number)) / avg) * 100 : 0);
  }
  return { middle, upper, lower, width };
}

/** Calculates a client-side Supertrend line and bullish state series. */
function supertrendSeries(highs: number[], lows: number[], closes: number[], period: number, multiplier: number) {
  const atr = atrSeries(highs, lows, closes, period);
  const upperBasic = highs.map((high, index) => ((high + lows[index]) / 2) + multiplier * atr[index]);
  const lowerBasic = highs.map((high, index) => ((high + lows[index]) / 2) - multiplier * atr[index]);
  const upperFinal = upperBasic.slice();
  const lowerFinal = lowerBasic.slice();
  const line = [upperBasic[0] || 0];
  const bullish = [false];
  for (let index = 1; index < closes.length; index += 1) {
    upperFinal[index] =
      upperBasic[index] < upperFinal[index - 1] || closes[index - 1] > upperFinal[index - 1]
        ? upperBasic[index]
        : upperFinal[index - 1];
    lowerFinal[index] =
      lowerBasic[index] > lowerFinal[index - 1] || closes[index - 1] < lowerFinal[index - 1]
        ? lowerBasic[index]
        : lowerFinal[index - 1];

    if (line[index - 1] === upperFinal[index - 1]) {
      if (closes[index] <= upperFinal[index]) {
        line.push(upperFinal[index]);
        bullish.push(false);
      } else {
        line.push(lowerFinal[index]);
        bullish.push(true);
      }
    } else if (closes[index] >= lowerFinal[index]) {
      line.push(lowerFinal[index]);
      bullish.push(true);
    } else {
      line.push(upperFinal[index]);
      bullish.push(false);
    }
  }
  return { line, bullish };
}

/** Calculates the cumulative VWAP series for a candle set. */
function vwapSeries(candles: Candle[]) {
  let pv = 0;
  let vv = 0;
  return candles.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    pv += typical * candle.volume;
    vv += candle.volume;
    return vv ? pv / vv : candle.close;
  });
}
