import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton, AppInput, EmptyState, Field, InlineMessage, ListDivider, LoadingBlock, Row, ScreenScroll, SectionCard, toneColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { WatchlistItem } from '@/lib/types';

/** Renders watchlist management for web and native clients. */
export default function WatchlistScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState('NSE');
  const [sector, setSector] = useState('Custom');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!ready) {
      return;
    }
    void load();
  }, [ready, apiBaseUrl]);

  /** Loads the current watchlist from the backend. */
  async function load() {
    setBusy(true);
    setError('');
    try {
      setItems(await api.watchlist(apiBaseUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load watchlist.');
    } finally {
      setBusy(false);
    }
  }

  /** Adds a manually entered symbol to the watchlist. */
  async function addSymbol() {
    if (!symbol.trim()) {
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.addWatchlist(apiBaseUrl, {
        symbol: symbol.trim().toUpperCase(),
        exchange: exchange.trim().toUpperCase() || 'NSE',
        symbol_token: token.trim(),
        sector: sector.trim() || 'Custom',
      });
      setItems(result.items);
      setMessage(result.ok ? 'Watchlist item saved.' : 'Symbol already exists.');
      setSymbol('');
      setToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save symbol.');
    } finally {
      setBusy(false);
    }
  }

  /** Removes a symbol from the watchlist. */
  async function removeSymbol(value: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.removeWatchlist(apiBaseUrl, value);
      setItems(result.items);
      setMessage('Symbol removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove symbol.');
    } finally {
      setBusy(false);
    }
  }

  /** Toggles whether a watchlist symbol is enabled for scans. */
  async function toggleSymbol(item: WatchlistItem) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.toggleWatchlist(apiBaseUrl, item.symbol, item.enabled !== 'true');
      setItems(result.items);
      setMessage('Watchlist updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update symbol.');
    } finally {
      setBusy(false);
    }
  }

  /** Seeds the watchlist with the built-in sector defaults. */
  async function seedDefaults() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.seedWatchlist(apiBaseUrl);
      setItems(result.items);
      setMessage(`Reloaded sector defaults. Inserted ${result.inserted} rows.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to seed defaults.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll title="Watchlist" subtitle="Manage the universe used across scanner, strategies, and dashboard flows.">
      {message ? <InlineMessage tone="good" text={message} /> : null}
      {error ? <InlineMessage tone="danger" text={error} /> : null}

      <SectionCard title="Add Symbol" subtitle="Manual additions mix with sector seed lists and scanner universes.">
        <Field label="Symbol">
          <AppInput autoCapitalize="characters" value={symbol} onChangeText={setSymbol} placeholder="RELIANCE-EQ" />
        </Field>
        <Field label="Exchange">
          <AppInput value={exchange} onChangeText={setExchange} placeholder="NSE" />
        </Field>
        <Field label="Sector">
          <AppInput value={sector} onChangeText={setSector} placeholder="Custom" />
        </Field>
        <Field label="Token (optional)">
          <AppInput value={token} onChangeText={setToken} placeholder="Broker token" />
        </Field>
        <AppButton label="Save Symbol" onPress={() => void addSymbol()} />
        <AppButton label="Reload Sector Defaults" tone="secondary" onPress={() => void seedDefaults()} />
      </SectionCard>

      <SectionCard title={`Current Watchlist (${items.length})`} subtitle="Enabled items are used by the backend scans.">
        {busy && !items.length ? <LoadingBlock label="Loading watchlist..." /> : null}
        {!busy && !items.length ? <EmptyState title="No watchlist items yet." subtitle="Seed sector defaults or add your first symbol manually." /> : null}
        {items.map((item, index) => (
          <View key={item.symbol}>
            {index ? <ListDivider /> : null}
            <Row
              left={
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#102a35' }}>{item.symbol}</Text>
                  <Text style={{ marginTop: 4, color: '#4d6770' }}>
                    {item.exchange} · {item.sector} · {item.source}
                  </Text>
                  <Text style={{ marginTop: 6, color: toneColor(item.enabled === 'true' ? 'BUY' : 'SELL'), fontWeight: '700' }}>
                    {item.enabled === 'true' ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
              }
              right={
                <View style={{ gap: 8, minWidth: 120 }}>
                  <AppButton label={item.enabled === 'true' ? 'Disable' : 'Enable'} tone="secondary" onPress={() => void toggleSymbol(item)} />
                  <AppButton label="Remove" tone="danger" onPress={() => void removeSymbol(item.symbol)} />
                </View>
              }
            />
          </View>
        ))}
      </SectionCard>
    </ScreenScroll>
  );
}
