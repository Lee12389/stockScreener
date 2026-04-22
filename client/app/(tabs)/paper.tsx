import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton, AppInput, ChipButton, ChipRow, EmptyState, Field, InlineMessage, ListDivider, LoadingBlock, MetricGrid, Row, ScreenScroll, SectionCard, toneColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { formatCompactCurrency, formatNumber, formatTimestamp } from '@/lib/format';
import { PaperSummary, StrategyKind } from '@/lib/types';

/** Renders the paper trading workflow and account summary. */
export default function PaperScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [startingCash, setStartingCash] = useState('100000');
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState<StrategyKind>('merged');
  const [action, setAction] = useState('AUTO');
  const [amount, setAmount] = useState('0');
  const [autoInterval, setAutoInterval] = useState('15');
  const [autoTrades, setAutoTrades] = useState('3');

  useEffect(() => {
    if (!ready) {
      return;
    }
    void load();
  }, [ready, apiBaseUrl]);

  /** Loads the latest paper account summary from the backend. */
  async function load() {
    setBusy(true);
    setError('');
    try {
      const data = await api.paperSummary(apiBaseUrl);
      setSummary(data);
      setStartingCash(String(data.starting_cash || 100000));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load paper summary.');
    } finally {
      setBusy(false);
    }
  }

  /** Resets the paper account to the requested starting cash. */
  async function resetAccount() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.resetPaperFund(apiBaseUrl, Number(startingCash) || 100000);
      setSummary(result.summary);
      setMessage('Paper account reset.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset paper account.');
    } finally {
      setBusy(false);
    }
  }

  /** Runs one manual or AUTO-driven paper trade. */
  async function runTrade() {
    if (!symbol.trim()) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.paperTrade(apiBaseUrl, {
        symbol: symbol.trim().toUpperCase(),
        strategy,
        action,
        amount: Number(amount) || 0,
        refresh_signals: true,
      });
      setMessage(String(result.message || 'Paper trade executed.'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run paper trade.');
      setBusy(false);
    }
  }

  /** Starts the scheduled paper-trading bot. */
  async function startAuto() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.startPaperAuto(apiBaseUrl, {
        strategy,
        interval_minutes: Math.max(1, Number(autoInterval) || 15),
        max_trades_per_cycle: Math.max(1, Number(autoTrades) || 3),
        refresh_signals: true,
      });
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start paper auto trader.');
      setBusy(false);
    }
  }

  /** Stops the scheduled paper-trading bot. */
  async function stopAuto() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.stopPaperAuto(apiBaseUrl);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop paper auto trader.');
      setBusy(false);
    }
  }

  return (
    <ScreenScroll title="Paper Trading" subtitle="Run manual or automated paper execution against the backend strategy engine.">
      {message ? <InlineMessage tone="good" text={message} /> : null}
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      {!ready || (busy && !summary) ? <LoadingBlock label="Loading paper account..." /> : null}

      {summary ? (
        <>
          <SectionCard title="Account" subtitle={summary.auto_running ? 'Auto paper trader is running.' : 'Auto paper trader is idle.'}>
            <MetricGrid
              items={[
                { label: 'Starting', value: formatCompactCurrency(summary.starting_cash) },
                { label: 'Cash', value: formatCompactCurrency(summary.cash_balance) },
                { label: 'Equity', value: formatCompactCurrency(summary.equity) },
                {
                  label: 'Total PnL',
                  value: formatNumber(summary.total_pnl, 0),
                  tone: summary.total_pnl >= 0 ? 'good' : 'danger',
                },
              ]}
            />
            <Field label="Reset Starting Cash">
              <AppInput keyboardType="numeric" value={startingCash} onChangeText={setStartingCash} />
            </Field>
            <AppButton label="Reset Paper Account" onPress={() => void resetAccount()} />
          </SectionCard>

          <SectionCard title="Manual Trade" subtitle="Use AUTO to let the backend follow the current signal.">
            <Field label="Symbol">
              <AppInput autoCapitalize="characters" value={symbol} onChangeText={setSymbol} placeholder="TCS-EQ" />
            </Field>
            <Field label="Strategy">
              <ChipRow>
                {(['merged', 'rsi', 'supertrend'] as StrategyKind[]).map((item) => (
                  <ChipButton key={item} label={item} active={strategy === item} onPress={() => setStrategy(item)} />
                ))}
              </ChipRow>
            </Field>
            <Field label="Action">
              <ChipRow>
                {['AUTO', 'BUY', 'SELL'].map((item) => (
                  <ChipButton key={item} label={item} active={action === item} onPress={() => setAction(item)} />
                ))}
              </ChipRow>
            </Field>
            <Field label="Amount cap (0 = backend sizing)">
              <AppInput keyboardType="numeric" value={amount} onChangeText={setAmount} />
            </Field>
            <AppButton label="Run Paper Trade" onPress={() => void runTrade()} />
          </SectionCard>

          <SectionCard title="Auto Paper" subtitle="Schedule repeated paper trades from the selected strategy.">
            <Field label="Interval (minutes)">
              <AppInput keyboardType="numeric" value={autoInterval} onChangeText={setAutoInterval} />
            </Field>
            <Field label="Max trades per cycle">
              <AppInput keyboardType="numeric" value={autoTrades} onChangeText={setAutoTrades} />
            </Field>
            <AppButton label="Start Auto Paper" onPress={() => void startAuto()} />
            <AppButton label="Stop Auto Paper" tone="danger" onPress={() => void stopAuto()} />
          </SectionCard>

          <SectionCard title={`Open Positions (${summary.positions.length})`} subtitle="Marked using the backend price map.">
            {summary.positions.length ? (
              summary.positions.map((position, index) => (
                <View key={position.symbol}>
                  {index ? <ListDivider /> : null}
                  <Row
                    left={
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>{position.symbol}</Text>
                        <Text style={{ marginTop: 4, color: '#4d6770' }}>
                          Qty {position.quantity} · Avg {formatNumber(position.avg_price)} · LTP {formatNumber(position.ltp)}
                        </Text>
                      </View>
                    }
                    right={
                      <Text style={{ fontWeight: '800', color: toneColor(position.unrealized_pnl >= 0 ? 'BUY' : 'SELL') }}>
                        {formatNumber(position.unrealized_pnl, 0)}
                      </Text>
                    }
                  />
                </View>
              ))
            ) : (
              <EmptyState title="No open positions." subtitle="Run a manual or auto paper trade to populate this section." />
            )}
          </SectionCard>

          <SectionCard title={`Recent Trades (${summary.trades.length})`} subtitle="Latest 100 paper trades.">
            {summary.trades.length ? (
              summary.trades.slice(0, 20).map((trade, index) => (
                <View key={`${trade.time}-${trade.symbol}-${index}`}>
                  {index ? <ListDivider /> : null}
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>
                    {trade.symbol} · {trade.side} · {trade.quantity} @ {formatNumber(trade.price)}
                  </Text>
                  <Text style={{ marginTop: 4, color: '#4d6770' }}>{formatTimestamp(trade.time)}</Text>
                  <Text style={{ marginTop: 6, color: toneColor(trade.realized_pnl >= 0 ? 'BUY' : 'SELL'), fontWeight: '700' }}>
                    Realized {formatNumber(trade.realized_pnl, 0)} · Balance {formatCompactCurrency(trade.balance_after)}
                  </Text>
                </View>
              ))
            ) : (
              <EmptyState title="No paper trades yet." subtitle="Your trade ledger will appear here after the first run." />
            )}
          </SectionCard>
        </>
      ) : null}
    </ScreenScroll>
  );
}
