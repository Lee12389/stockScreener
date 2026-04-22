import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';

import { PriceChart, Sparkline } from '@/components/charts';
import { AppButton, AppInput, ChipButton, ChipRow, DataPill, EmptyState, Field, InlineMessage, LoadingBlock, MetricGrid, ScreenScroll, SectionCard, toneColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';
import { formatNumber, formatSigned } from '@/lib/format';
import { buildChartSeries, buildScannerRows, ChartTimeframe, intervalLabelFor, matchesPreset, PRESET_LABELS } from '@/lib/scanner-engine';
import { BoughtInfo, PresetKey, ScannerConfig, ScannerDatasetItem, ScannerRow } from '@/lib/types';

const INTERVALS = ['FIFTEEN_MINUTE', 'ONE_HOUR', 'ONE_DAY', 'ONE_WEEK', 'ONE_MONTH'] as const;

/** Renders the shared mobile/web scanner experience backed by local ranking. */
export default function ScannerScreen() {
  const { apiBaseUrl, ready } = useApiConfig();
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  const [rows, setRows] = useState<ScannerRow[]>([]);
  const [scopeSymbols, setScopeSymbols] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState('55');
  const [preset, setPreset] = useState<PresetKey>('all');
  const [visibleLimit, setVisibleLimit] = useState('60');
  const [boughtOnly, setBoughtOnly] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ScannerRow | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('primary');
  const [entryPrice, setEntryPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!ready) {
      return;
    }
    void loadDataset(false);
  }, [ready, apiBaseUrl]);

  /** Fetches the raw scanner dataset and rebuilds rows locally on-device. */
  async function loadDataset(refresh: boolean) {
    setBusy(true);
    setError('');
    setMessage(refresh ? 'Fetching raw dataset from backend...' : 'Loading cached dataset...');
    try {
      const response = await api.scannerDataset(apiBaseUrl, { refresh });
      if (response.error) {
        setError(response.error);
        setRows([]);
        return;
      }
      const nextConfig = response.config;
      setConfig(nextConfig);
      setScopeSymbols(response.scope_symbols || []);
      const processed = buildScannerRows(response.items as ScannerDatasetItem[], nextConfig, response.bought as BoughtInfo[]);
      setRows(processed);
      setMessage(`Dataset ready. ${processed.length} rows processed locally from ${response.count} raw symbols.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load scanner dataset.');
    } finally {
      setBusy(false);
    }
  }

  /** Persists scanner config changes and refreshes the dataset. */
  async function saveConfig(nextConfig: ScannerConfig) {
    setBusy(true);
    setError('');
    try {
      const saved = await api.updateScannerConfig(apiBaseUrl, serializeConfig(nextConfig));
      setConfig(saved);
      setMessage('Scanner config saved. Refreshing dataset...');
      await loadDataset(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save scanner config.');
      setBusy(false);
    }
  }

  /** Adds or updates the currently selected symbol in the bought monitor. */
  async function trackRow() {
    if (!selectedRow) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.addBought(apiBaseUrl, {
        symbol: selectedRow.symbol,
        entry_price: Number(entryPrice) || selectedRow.close,
        quantity: Math.max(1, Number(quantity) || 1),
        note: note.trim(),
      });
      setMessage(`Tracking ${selectedRow.symbol}.`);
      await loadDataset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to track symbol.');
      setBusy(false);
    }
  }

  /** Removes a symbol from the bought monitor and refreshes the rows. */
  async function untrackRow(symbol: string) {
    setBusy(true);
    setError('');
    try {
      await api.removeBought(apiBaseUrl, symbol);
      setMessage(`Removed ${symbol} from bought monitor.`);
      await loadDataset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove symbol from bought monitor.');
      setBusy(false);
    }
  }

  /** Opens the detail modal for the selected scanner row. */
  function openRow(row: ScannerRow) {
    setSelectedRow(row);
    setChartTimeframe('primary');
    setEntryPrice(String(row.close));
    setQuantity(row.bought?.quantity ? String(row.bought.quantity) : '1');
    setNote(row.bought?.note || '');
  }

  /** Opens the richer browser-based scanner for desktop-style workflows. */
  async function openAdvancedScanner() {
    const url = `${apiBaseUrl}/scanner`;
    await WebBrowser.openBrowserAsync(url);
  }

  const visibleRows = rows
    .filter((row) => row.symbol.toUpperCase().includes(search.trim().toUpperCase()))
    .filter((row) => row.score >= (Number(minScore) || 0))
    .filter((row) => (boughtOnly ? row.isBought : true))
    .filter((row) => matchesPreset(row, preset))
    .slice(0, Math.max(10, Number(visibleLimit) || 60));

  const buyCount = visibleRows.filter((row) => row.signal === 'BUY' || row.signal === 'STRONG_BUY').length;
  const watchCount = visibleRows.filter((row) => row.signal === 'WATCH').length;
  const avgVolume = visibleRows.length ? visibleRows.reduce((sum, row) => sum + row.volumeRatio, 0) / visibleRows.length : 0;
  const selectedChart = selectedRow ? buildChartSeries(selectedRow, chartTimeframe) : null;

  return (
    <ScreenScroll
      title="Scanner"
      subtitle="Raw candles from FastAPI, indicator math and ranking on-device."
      rightAction={<AppButton label="Refresh" onPress={() => void loadDataset(true)} />}>
      {message ? <InlineMessage text={message} /> : null}
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      {!ready || (busy && !config) ? <LoadingBlock label="Loading scanner..." /> : null}

      {config ? (
        <>
          <SectionCard title="Scanner Scope" subtitle={`Current scope: ${scopeSymbols.length ? `${scopeSymbols.length} symbols` : 'full universe cache'}`}>
            <Field label="Interval">
              <ChipRow>
                {INTERVALS.map((value) => (
                  <ChipButton
                    key={value}
                    label={intervalLabelFor(value)}
                    active={config.scan_interval === value}
                    onPress={() => setConfig({ ...config, scan_interval: value })}
                  />
                ))}
              </ChipRow>
            </Field>
            <Field label="Weekly / Monthly confirmation">
              <ChipRow>
                <ChipButton
                  label={boolish(config.use_weekly_monthly) ? 'MTF Confirm On' : 'MTF Confirm Off'}
                  active={boolish(config.use_weekly_monthly)}
                  onPress={() => setConfig({ ...config, use_weekly_monthly: !boolish(config.use_weekly_monthly) })}
                />
              </ChipRow>
            </Field>
            <Field label="Volume multiplier">
              <AppInput keyboardType="numeric" value={String(config.volume_multiplier)} onChangeText={(value) => setConfig({ ...config, volume_multiplier: Number(value) || 1.5 })} />
            </Field>
            <AppButton label="Save Scanner Config" onPress={() => void saveConfig(config)} />
            <AppButton label="Open Advanced Web Scanner" tone="secondary" onPress={() => void openAdvancedScanner()} />
          </SectionCard>

          <SectionCard title="Filters" subtitle="Fast local filtering after the dataset is fetched once.">
            <Field label="Search symbol">
              <AppInput value={search} onChangeText={setSearch} placeholder="TCS, HDFC..." />
            </Field>
            <Field label="Minimum score">
              <AppInput keyboardType="numeric" value={minScore} onChangeText={setMinScore} />
            </Field>
            <Field label="Visible rows limit">
              <AppInput keyboardType="numeric" value={visibleLimit} onChangeText={setVisibleLimit} />
            </Field>
            <Field label="Presets">
              <ChipRow>
                {(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => (
                  <ChipButton key={key} label={key === 'all' ? 'All' : PRESET_LABELS[key]} active={preset === key} onPress={() => setPreset(key)} />
                ))}
              </ChipRow>
            </Field>
            <ChipRow>
              <ChipButton label="Bought Only" active={boughtOnly} onPress={() => setBoughtOnly((value) => !value)} />
            </ChipRow>
          </SectionCard>

          <SectionCard title="Visible Setups" subtitle="These cards are scored on the device after the dataset is loaded.">
            <MetricGrid
              items={[
                { label: 'Universe', value: String(rows.length) },
                { label: 'Visible', value: String(visibleRows.length) },
                { label: 'Buy / Strong', value: String(buyCount), tone: 'good' },
                { label: 'Watch', value: String(watchCount), tone: 'warn' },
                { label: 'Avg Vol x', value: formatNumber(avgVolume, 2) },
              ]}
            />
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <View
                  key={row.symbol}
                  style={{
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: '#e3d6be',
                    backgroundColor: '#fff',
                    padding: 14,
                    gap: 10,
                  }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#102a35' }}>
                    {row.symbol} · {row.signal}
                  </Text>
                  <Text style={{ color: toneColor(row.signal), fontWeight: '700' }}>
                    Score {row.score} · {row.trendLabel} · {formatSigned(row.changePct)}%
                  </Text>
                  <Sparkline values={row.sparklineValues} color={row.changePct >= 0 ? '#0f766e' : '#c24632'} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <DataPill label="Price" value={formatNumber(row.close)} />
                    <DataPill label="RSI D/W/M" value={`${formatNumber(row.dailyRsi, 0)}/${formatNumber(row.weeklyRsi, 0)}/${formatNumber(row.monthlyRsi, 0)}`} />
                    <DataPill label="ADX" value={formatNumber(row.adx, 1)} />
                    <DataPill label="Vol x" value={formatNumber(row.volumeRatio, 2)} />
                    <DataPill label="Level" value={row.levelContext} />
                  </View>
                  <Text style={{ color: '#4d6770', lineHeight: 20 }}>{row.reasons.slice(0, 3).join(' ')}</Text>
                  <Text style={{ color: '#102a35', fontWeight: '700' }}>
                    Scans: {row.scans.length ? row.scans.join(', ') : 'No preset hit'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <AppButton label="Open Detail" onPress={() => openRow(row)} />
                    {row.isBought ? (
                      <AppButton label="Remove Track" tone="secondary" onPress={() => void untrackRow(row.symbol)} />
                    ) : (
                      <AppButton label="Track Bought" tone="secondary" onPress={() => openRow(row)} />
                    )}
                  </View>
                </View>
              ))
            ) : (
              <EmptyState title="No rows match the current scanner filters." subtitle="Relax the minimum score, change presets, or refresh the dataset." />
            )}
          </SectionCard>
        </>
      ) : null}

      <Modal visible={Boolean(selectedRow)} animationType="slide" onRequestClose={() => setSelectedRow(null)}>
        <ScrollView style={{ flex: 1, backgroundColor: '#f5efe4' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
          <AppButton label="Close Detail" tone="secondary" onPress={() => setSelectedRow(null)} />
          {selectedRow && selectedChart ? (
            <>
              <SectionCard title={`${selectedRow.symbol} Detail`} subtitle={`${selectedRow.signal} · Score ${selectedRow.score} · ${selectedRow.sector}`}>
                <ChipRow>
                  {(['primary', 'daily', 'weekly', 'monthly'] as ChartTimeframe[]).map((item) => (
                    <ChipButton key={item} label={item === 'primary' ? selectedRow.intervalLabel : item} active={chartTimeframe === item} onPress={() => setChartTimeframe(item)} />
                  ))}
                </ChipRow>
                <PriceChart {...selectedChart} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <DataPill label="Close" value={formatNumber(selectedRow.close)} />
                  <DataPill label="Support" value={formatNumber(selectedRow.support)} />
                  <DataPill label="Resistance" value={formatNumber(selectedRow.resistance)} />
                  <DataPill label="52W High" value={formatNumber(selectedRow.high52w)} />
                  <DataPill label="MACD" value={`${formatNumber(selectedRow.macd, 2)} / ${formatNumber(selectedRow.macdSignal, 2)}`} />
                  <DataPill label="Stoch" value={`${formatNumber(selectedRow.stochK, 0)} / ${formatNumber(selectedRow.stochD, 0)}`} />
                </View>
                <Text style={{ color: '#4d6770', lineHeight: 20 }}>{selectedRow.reasons.concat(selectedRow.boughtReasons).join(' ')}</Text>
              </SectionCard>

              <SectionCard title="Track / Update Bought Position" subtitle="This stays synced with the backend bought monitor.">
                <Field label="Entry price">
                  <AppInput keyboardType="numeric" value={entryPrice} onChangeText={setEntryPrice} />
                </Field>
                <Field label="Quantity">
                  <AppInput keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
                </Field>
                <Field label="Note">
                  <AppInput value={note} onChangeText={setNote} placeholder="swing, positional, intraday..." />
                </Field>
                <AppButton label={selectedRow.isBought ? 'Update Bought Track' : 'Add Bought Track'} onPress={() => void trackRow()} />
                {selectedRow.isBought ? <AppButton label="Remove Bought Track" tone="danger" onPress={() => void untrackRow(selectedRow.symbol)} /> : null}
              </SectionCard>
            </>
          ) : null}
        </ScrollView>
      </Modal>
    </ScreenScroll>
  );
}

/** Normalizes boolean-like values coming back from persisted config. */
function boolish(value: unknown) {
  return value === true || value === 'true';
}

/** Converts the mutable scanner config into the backend payload shape. */
function serializeConfig(config: ScannerConfig): ScannerConfig {
  return {
    ...config,
    include_nifty50: boolish(config.include_nifty50),
    include_midcap150: boolish(config.include_midcap150),
    include_nifty500: boolish(config.include_nifty500),
    use_weekly_monthly: boolish(config.use_weekly_monthly),
    show_ema: true,
    show_rsi: true,
    show_macd: true,
    show_supertrend: true,
    show_volume: true,
    show_sr: true,
  };
}
