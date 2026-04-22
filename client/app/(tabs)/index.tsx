import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton, ChipButton, ChipRow, EmptyState, InlineMessage, ListDivider, LoadingBlock, MetricGrid, Row, ScreenScroll, SectionCard, toneColor, uiStyles } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { formatCompactCurrency, formatSigned } from '@/lib/format';
import { DashboardSummary } from '@/lib/types';

/** Renders the cross-platform desk summary and broker controls. */
export default function DashboardScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [health, setHealth] = useState<{ status: string; app: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) {
      return;
    }
    void loadDesk(false);
  }, [ready, apiBaseUrl]);

  /** Loads dashboard health and summary data from the backend. */
  async function loadDesk(refresh: boolean) {
    setBusy(true);
    setError('');
    try {
      const [healthData, summaryData] = await Promise.all([
        api.health(apiBaseUrl),
        api.dashboardSummary(apiBaseUrl, refresh),
      ]);
      setHealth(healthData);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setBusy(false);
    }
  }

  /** Connects or reconnects the broker session, then refreshes the desk. */
  async function connectBroker() {
    setBusy(true);
    setError('');
    try {
      const response = await api.connectSession(apiBaseUrl);
      await loadDesk(response.connected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect broker session.');
      setBusy(false);
    }
  }

  /** Switches the persisted trade mode and refreshes the dashboard. */
  async function setMode(mode: 'paper' | 'live') {
    setBusy(true);
    setError('');
    try {
      await api.setTradeMode(apiBaseUrl, mode);
      await loadDesk(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update trade mode.');
      setBusy(false);
    }
  }

  return (
    <ScreenScroll
      title="Trading Desk"
      subtitle={`FastAPI backend + Expo client. API target: ${apiBaseUrl}`}
      rightAction={<AppButton label="Refresh" onPress={() => void loadDesk(true)} />}>
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      {summary?.info_message ? <InlineMessage text={summary.info_message} /> : null}
      {!ready || busy && !summary ? <LoadingBlock label="Loading dashboard..." /> : null}

      {summary ? (
        <>
          <SectionCard title={health?.app || summary.app_name} subtitle={`Backend health: ${health?.status || 'unknown'}`}>
            <MetricGrid
              items={[
                { label: 'Mode', value: summary.mode.toUpperCase(), tone: summary.mode === 'paper' ? 'good' : 'warn' },
                { label: 'Broker', value: summary.connected ? 'Connected' : 'Offline', tone: summary.connected ? 'good' : 'danger' },
                { label: 'Watchlist', value: String(summary.watchlist_count) },
                { label: 'Live Allowed', value: summary.allow_live ? 'Yes' : 'No', tone: summary.allow_live ? 'warn' : 'default' },
              ]}
            />
            <ChipRow>
              <ChipButton label="Paper Mode" active={summary.mode === 'paper'} onPress={() => void setMode('paper')} />
              <ChipButton label="Live Mode" active={summary.mode === 'live'} onPress={() => void setMode('live')} />
            </ChipRow>
            <AppButton label={summary.connected ? 'Reconnect Broker' : 'Connect Broker'} onPress={() => void connectBroker()} />
          </SectionCard>

          <SectionCard title="Top Performers" subtitle="Latest broker-backed leaders from your enabled watchlist.">
            {summary.performers.length ? (
              summary.performers.map((item, index) => (
                <View key={item.symbol}>
                  {index ? <ListDivider /> : null}
                  <Row
                    left={
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>{item.symbol}</Text>
                        <Text style={{ color: '#4d6770', marginTop: 4 }}>
                          Price {item.last_price != null ? formatCompactCurrency(item.last_price) : '-'}
                        </Text>
                      </View>
                    }
                    right={
                      <Text style={{ fontWeight: '800', color: toneColor(item.change_pct && item.change_pct >= 0 ? 'BUY' : 'SELL') }}>
                        {formatSigned(item.change_pct, 2)}%
                      </Text>
                    }
                  />
                </View>
              ))
            ) : (
              <EmptyState title="No fresh performer data yet." subtitle="Tap Refresh to pull the latest broker data into the desk." />
            )}
          </SectionCard>

          <SectionCard title="Suggestions" subtitle="Action ideas generated from the current performer set.">
            {summary.suggestions.length ? (
              summary.suggestions.map((item, index) => (
                <View key={`${item.symbol}-${index}`}>
                  {index ? <ListDivider /> : null}
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>
                    {item.symbol} · {item.action}
                  </Text>
                  <Text style={{ color: '#4d6770', marginTop: 6, lineHeight: 20 }}>{item.reason}</Text>
                  <Text style={{ marginTop: 8, color: '#102a35', fontWeight: '700' }}>
                    Confidence {Math.round(item.confidence * 100)}%
                  </Text>
                </View>
              ))
            ) : (
              <EmptyState title="No suggestions yet." subtitle="Refresh the desk after connecting the broker session." />
            )}
          </SectionCard>

          <SectionCard title="Quick Notes" subtitle="A few reminders for daily use across web and native.">
            <Text style={uiStyles.inlineMessageText}>
              The scanner page keeps indicator math on-device after the raw dataset is fetched. For physical Android or iPhone use, point Settings at your laptop&apos;s LAN IP so the app can reach the backend on the same network.
            </Text>
          </SectionCard>
        </>
      ) : null}
    </ScreenScroll>
  );
}
