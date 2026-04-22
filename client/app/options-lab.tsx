import { useState } from 'react';
import { Text } from 'react-native';

import { AppButton, AppInput, ChipButton, ChipRow, EmptyState, Field, InlineMessage, ScreenScroll, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';

const SAMPLE_ROWS = `# strike,call_oi,put_oi,call_iv,put_iv,call_ltp,put_ltp,call_volume,put_volume
22400,120000,90000,14.2,16.3,180,40,250000,190000
22500,160000,130000,15.1,15.8,130,55,320000,220000
22600,140000,170000,15.8,15.1,95,75,280000,260000
22700,90000,180000,16.4,14.7,68,102,170000,300000`;

const SAMPLE_LEGS = `# side,kind,strike,premium,qty
buy,call,22500,130,1
sell,call,22600,95,1`;

export default function OptionsLabScreen() {
  const { apiBaseUrl } = useApiConfig();
  const [mode, setMode] = useState<'recommend' | 'custom'>('recommend');
  const [spot, setSpot] = useState('22550');
  const [capital, setCapital] = useState('100000');
  const [rowsCsv, setRowsCsv] = useState(SAMPLE_ROWS);
  const [legsCsv, setLegsCsv] = useState(SAMPLE_LEGS);
  const [lotSize, setLotSize] = useState('50');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const response =
        mode === 'recommend'
          ? await api.optionsRecommend(apiBaseUrl, {
              spot: Number(spot) || 0,
              capital: Number(capital) || 0,
              option_rows_csv: rowsCsv,
            })
          : await api.optionsCustom(apiBaseUrl, {
              spot: Number(spot) || 0,
              capital: Number(capital) || 0,
              option_rows_csv: rowsCsv,
              legs_csv: legsCsv,
              lot_size: Number(lotSize) || 50,
            });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run options workflow.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll title="Options Lab" subtitle="Run the existing recommendation and custom strategy endpoints from the same mobile/web client.">
      {error ? <InlineMessage tone="danger" text={error} /> : null}
      <SectionCard title="Mode" subtitle="Choose between recommendation and custom strategy evaluation.">
        <ChipRow>
          <ChipButton label="Recommend" active={mode === 'recommend'} onPress={() => setMode('recommend')} />
          <ChipButton label="Custom" active={mode === 'custom'} onPress={() => setMode('custom')} />
        </ChipRow>
      </SectionCard>

      <SectionCard title="Inputs" subtitle="The backend accepts CSV payloads for option rows and legs.">
        <Field label="Spot">
          <AppInput keyboardType="numeric" value={spot} onChangeText={setSpot} />
        </Field>
        <Field label="Capital">
          <AppInput keyboardType="numeric" value={capital} onChangeText={setCapital} />
        </Field>
        <Field label="Option rows CSV">
          <AppInput multiline value={rowsCsv} onChangeText={setRowsCsv} />
        </Field>
        {mode === 'custom' ? (
          <>
            <Field label="Legs CSV">
              <AppInput multiline value={legsCsv} onChangeText={setLegsCsv} />
            </Field>
            <Field label="Lot size">
              <AppInput keyboardType="numeric" value={lotSize} onChangeText={setLotSize} />
            </Field>
          </>
        ) : null}
        <AppButton label={busy ? 'Running...' : 'Run Options Lab'} onPress={() => void run()} disabled={busy} />
      </SectionCard>

      <SectionCard title="Result" subtitle="Raw JSON from the backend for now, ready for richer visualizations later.">
        {result ? (
          <Text style={{ color: '#102a35', fontFamily: 'SpaceMono', lineHeight: 20 }}>{result}</Text>
        ) : (
          <EmptyState title="No options result yet." subtitle="Run either mode to inspect the backend response here." />
        )}
      </SectionCard>
    </ScreenScroll>
  );
}
