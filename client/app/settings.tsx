import { useState } from 'react';
import { Text } from 'react-native';

import { AppButton, AppInput, EmptyState, Field, InlineMessage, ScreenScroll, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiConfig } from '@/lib/api-config';

export default function SettingsScreen() {
  const { apiBaseUrl, defaultApiBaseUrl, setApiBaseUrl, resetApiBaseUrl } = useApiConfig();
  const [draft, setDraft] = useState(apiBaseUrl);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    setMessage('');
    try {
      await setApiBaseUrl(draft);
      setMessage('API base URL saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save API URL.');
    }
  }

  async function reset() {
    setError('');
    setMessage('');
    try {
      await resetApiBaseUrl();
      setDraft(defaultApiBaseUrl);
      setMessage('API base URL reset to the platform default.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset API URL.');
    }
  }

  async function test() {
    setError('');
    setMessage('');
    try {
      const health = await api.health(draft.trim());
      setMessage(`Connected to ${health.app} (${health.status}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach the backend.');
    }
  }

  return (
    <ScreenScroll title="Settings" subtitle="Point the app at the FastAPI backend running on your laptop or dev machine.">
      {message ? <InlineMessage tone="good" text={message} /> : null}
      {error ? <InlineMessage tone="danger" text={error} /> : null}

      <SectionCard title="API Base URL" subtitle="Use the laptop LAN IP for physical devices on the same Wi-Fi.">
        <Field label="Backend URL">
          <AppInput autoCapitalize="none" autoCorrect={false} value={draft} onChangeText={setDraft} placeholder="http://192.168.1.20:5015" />
        </Field>
        <AppButton label="Save URL" onPress={() => void save()} />
        <AppButton label="Test Connection" tone="secondary" onPress={() => void test()} />
        <AppButton label="Reset To Default" tone="secondary" onPress={() => void reset()} />
      </SectionCard>

      <SectionCard title="Default Targets" subtitle={`Current default: ${defaultApiBaseUrl}`}>
        <Text style={{ color: '#4d6770', lineHeight: 20 }}>
          Web uses the current browser host with port 5015. Android emulators default to 10.0.2.2. Physical devices usually need your laptop&apos;s local network IP.
        </Text>
      </SectionCard>

      <EmptyState
        title="Daily routine tip"
        subtitle="Start the FastAPI backend first, then open this Expo app on web or device and verify the connection here before running scans."
      />
    </ScreenScroll>
  );
}
