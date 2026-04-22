import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { AppButton, MetricGrid, ScreenScroll, SectionCard } from '@/components/ui';
import { useApiConfig } from '@/lib/api-config';

const ROUTES = [
  { title: 'Strategies', subtitle: 'Broker-backed RSI, supertrend, and merged scans.', path: '/strategies' as const },
  { title: 'Monitor', subtitle: 'Track bought symbols and reversal alerts.', path: '/monitor' as const },
  { title: 'Tournament', subtitle: 'Run the 10-bot tournament and review leaderboard output.', path: '/tournament' as const },
  { title: 'Options Lab', subtitle: 'Run options recommendations and custom legs.', path: '/options-lab' as const },
  { title: 'Settings', subtitle: 'Configure the API base URL for web, simulator, or phone.', path: '/settings' as const },
];

export default function MoreScreen() {
  const router = useRouter();
  const { apiBaseUrl } = useApiConfig();

  return (
    <ScreenScroll title="More Tools" subtitle="The remaining workflows live here so tabs stay focused on the daily path.">
      <SectionCard title="Current Connection" subtitle="Native and web both use the same backend contract.">
        <MetricGrid items={[{ label: 'API Base', value: apiBaseUrl.replace(/^https?:\/\//, '') }]} />
      </SectionCard>

      {ROUTES.map((route) => (
        <SectionCard key={route.path} title={route.title} subtitle={route.subtitle}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: '#4d6770', lineHeight: 20 }}>
              This screen is available in the same Expo app on Android, iOS, and web.
            </Text>
            <AppButton label={`Open ${route.title}`} onPress={() => router.push(route.path)} />
          </View>
        </SectionCard>
      ))}
    </ScreenScroll>
  );
}
