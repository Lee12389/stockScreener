import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton, EmptyState, InlineMessage, ListDivider, LoadingBlock, ScreenScroll, SectionCard, toneColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { formatNumber } from '@/lib/format';
import { MonitorResponse } from '@/lib/types';

export default function MonitorScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [monitor, setMonitor] = useState<MonitorResponse | null>(null);
  const [busy, setBusy] = useState(false);
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
      const response = await api.boughtMonitor(apiBaseUrl, refresh);
      setMonitor(response);
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load monitor items.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll title="Bought Monitor" subtitle="Weak and strong sell alerts for symbols you have marked as bought.">
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      <SectionCard title={`Tracked Symbols (${monitor?.count || 0})`} subtitle="Refresh to recompute reversal warnings against the latest backend market view.">
        <AppButton label="Refresh Monitor" onPress={() => void load(true)} />
        {busy && !monitor ? <LoadingBlock label="Loading bought monitor..." /> : null}
        {monitor?.items?.length ? (
          monitor.items.map((item, index) => (
            <View key={item.symbol}>
              {index ? <ListDivider /> : null}
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#102a35' }}>
                {item.symbol} · {item.state}
              </Text>
              <Text style={{ marginTop: 4, color: toneColor(item.state), fontWeight: '700' }}>
                Entry {formatNumber(item.entry_price)} · LTP {formatNumber(item.ltp)} · PnL {formatNumber(item.pnl, 0)}
              </Text>
              <Text style={{ marginTop: 6, color: '#4d6770', lineHeight: 20 }}>
                Qty {item.quantity} · {item.reasons.length ? item.reasons.join(', ') : 'No sell warnings yet.'}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState title="No bought symbols are tracked yet." subtitle="Track positions from the scanner screen to start seeing reversal alerts here." />
        )}
      </SectionCard>
    </ScreenScroll>
  );
}
