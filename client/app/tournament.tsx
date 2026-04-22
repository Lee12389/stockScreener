import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton, AppInput, EmptyState, Field, InlineMessage, ListDivider, LoadingBlock, ScreenScroll, SectionCard, toneColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { formatCompactCurrency, formatNumber, formatTimestamp } from '@/lib/format';
import { TournamentBoard } from '@/lib/types';

export default function TournamentScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [board, setBoard] = useState<TournamentBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [capital, setCapital] = useState('1000000');
  const [intervalSeconds, setIntervalSeconds] = useState('60');

  useEffect(() => {
    if (!ready) {
      return;
    }
    void load();
  }, [ready, apiBaseUrl]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setBoard(await api.tournamentLeaderboard(apiBaseUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tournament leaderboard.');
    } finally {
      setBusy(false);
    }
  }

  async function initialize() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.tournamentInit(apiBaseUrl, Number(capital) || 1000000);
      setBoard(result.leaderboard);
      setMessage('Tournament bots reset and initialized.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize tournament.');
    } finally {
      setBusy(false);
    }
  }

  async function runOnce() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.tournamentRunOnce(apiBaseUrl, true);
      setMessage(String(result.message || 'Tournament cycle completed.'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run tournament cycle.');
      setBusy(false);
    }
  }

  async function startAuto() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.tournamentStart(apiBaseUrl, Math.max(10, Number(intervalSeconds) || 60), true);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start tournament auto-run.');
      setBusy(false);
    }
  }

  async function stopAuto() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.tournamentStop(apiBaseUrl);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to stop tournament auto-run.');
      setBusy(false);
    }
  }

  return (
    <ScreenScroll title="Tournament" subtitle="Ten strategy bots compete against the same backend market snapshot.">
      {message ? <InlineMessage tone="good" text={message} /> : null}
      {error ? <InlineMessage tone="danger" text={error} /> : null}

      <SectionCard title="Controls" subtitle={board?.running ? 'Tournament auto-run is active.' : 'Tournament auto-run is idle.'}>
        <Field label="Starting capital">
          <AppInput keyboardType="numeric" value={capital} onChangeText={setCapital} />
        </Field>
        <Field label="Auto interval (seconds)">
          <AppInput keyboardType="numeric" value={intervalSeconds} onChangeText={setIntervalSeconds} />
        </Field>
        <AppButton label="Initialize Bots" onPress={() => void initialize()} />
        <AppButton label="Run Once" tone="secondary" onPress={() => void runOnce()} />
        <AppButton label="Start Auto Run" tone="secondary" onPress={() => void startAuto()} />
        <AppButton label="Stop Auto Run" tone="danger" onPress={() => void stopAuto()} />
      </SectionCard>

      <SectionCard title={`Leaderboard (${board?.bots?.length || 0})`} subtitle="Ranked by equity and win rate.">
        {busy && !board ? <LoadingBlock label="Loading tournament..." /> : null}
        {board?.bots?.length ? (
          board.bots.map((bot, index) => (
            <View key={bot.bot_id}>
              {index ? <ListDivider /> : null}
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>
                {index + 1}. {bot.name}
              </Text>
              <Text style={{ marginTop: 4, color: toneColor(bot.return_pct >= 0 ? 'BUY' : 'SELL'), fontWeight: '700' }}>
                Equity {formatCompactCurrency(bot.equity)} · Return {formatNumber(bot.return_pct, 2)}%
              </Text>
              <Text style={{ marginTop: 6, color: '#4d6770', lineHeight: 20 }}>
                Trades {bot.trades_count} · Win rate {formatNumber(bot.win_rate_pct, 1)}% · Max DD {formatNumber(bot.max_drawdown_pct, 1)}% · Last run {formatTimestamp(bot.last_run_at)}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState title="No tournament bots yet." subtitle="Initialize the tournament to create the 10 bot roster." />
        )}
      </SectionCard>

      <SectionCard title="Recent Bot Trades" subtitle="Latest tournament exits and signal flips.">
        {board?.recent_trades?.length ? (
          board.recent_trades.slice(0, 25).map((trade, index) => (
            <View key={`${trade.time}-${trade.bot_id}-${index}`}>
              {index ? <ListDivider /> : null}
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>
                Bot {trade.bot_id} · {trade.symbol} · {trade.instrument}
              </Text>
              <Text style={{ marginTop: 4, color: toneColor(trade.pnl >= 0 ? 'BUY' : 'SELL'), fontWeight: '700' }}>
                {trade.side} · PnL {formatNumber(trade.pnl, 0)} · {trade.reason}
              </Text>
              <Text style={{ marginTop: 6, color: '#4d6770' }}>{formatTimestamp(trade.time)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No bot trades yet." subtitle="Run at least one tournament cycle to see recent bot exits here." />
        )}
      </SectionCard>
    </ScreenScroll>
  );
}
