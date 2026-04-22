import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton, AppInput, ChipButton, ChipRow, EmptyState, Field, InlineMessage, ListDivider, LoadingBlock, ScreenScroll, SectionCard, toneColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { formatNumber, formatSigned } from '@/lib/format';
import { StrategyHit, StrategyKind, StrategyScanResponse } from '@/lib/types';

export default function StrategiesScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [strategy, setStrategy] = useState<StrategyKind>('merged');
  const [limit, setLimit] = useState('30');
  const [minDailyRsi, setMinDailyRsi] = useState('45');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StrategyScanResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) {
      return;
    }
    void load(false);
  }, [ready, apiBaseUrl]);

  async function load(refresh: boolean) {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        strategy,
        limit: String(Math.max(1, Number(limit) || 30)),
        min_daily_rsi: String(Number(minDailyRsi) || 0),
        refresh: refresh ? 'true' : 'false',
      });
      const response = await api.strategyScan(apiBaseUrl, params);
      setResult(response);
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load strategy scan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll title="Strategies" subtitle="RSI, supertrend, and merged scans backed by the FastAPI strategy service.">
      {error ? <InlineMessage tone="danger" text={error} /> : null}

      <SectionCard title="Filters" subtitle="These filters execute on the backend strategy endpoints.">
        <Field label="Strategy">
          <ChipRow>
            {(['merged', 'rsi', 'supertrend'] as StrategyKind[]).map((item) => (
              <ChipButton key={item} label={item} active={strategy === item} onPress={() => setStrategy(item)} />
            ))}
          </ChipRow>
        </Field>
        <Field label="Minimum daily RSI">
          <AppInput keyboardType="numeric" value={minDailyRsi} onChangeText={setMinDailyRsi} />
        </Field>
        <Field label="Limit">
          <AppInput keyboardType="numeric" value={limit} onChangeText={setLimit} />
        </Field>
        <AppButton label="Run Fresh Strategy Scan" onPress={() => void load(true)} />
      </SectionCard>

      <SectionCard title={`Hits (${result?.count || 0})`} subtitle="Symbols that passed the selected strategy filter.">
        {busy && !result ? <LoadingBlock label="Loading strategy scan..." /> : null}
        {result?.hits?.length ? (
          result.hits.map((item: StrategyHit, index: number) => (
            <View key={`${item.symbol}-${index}`}>
              {index ? <ListDivider /> : null}
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#102a35' }}>
                {item.symbol} · {item.signal}
              </Text>
              <Text style={{ marginTop: 4, color: toneColor(item.signal), fontWeight: '700' }}>
                {formatSigned(item.change_pct, 2)}% · D/W/M RSI {formatNumber(item.daily_rsi, 0)}/{formatNumber(item.weekly_rsi, 0)}/{formatNumber(item.monthly_rsi, 0)}
              </Text>
              <Text style={{ marginTop: 6, color: '#4d6770', lineHeight: 20 }}>
                Sector {item.sector || '-'} · SL {formatNumber(item.stop_loss)} · Targets {item.targets?.join(', ') || '-'}
              </Text>
              {item.note ? <Text style={{ marginTop: 8, color: '#102a35' }}>{item.note}</Text> : null}
            </View>
          ))
        ) : (
          <EmptyState title="No strategy hits available." subtitle="Run a fresh scan or relax the RSI threshold." />
        )}
      </SectionCard>
    </ScreenScroll>
  );
}
