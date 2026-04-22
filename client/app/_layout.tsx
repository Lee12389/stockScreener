import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { palette } from '@/components/ui';
import { ApiConfigProvider } from '@/lib/api-config';
import { StatusBar } from 'expo-status-bar';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: palette.background,
      card: palette.panel,
      text: palette.ink,
      border: palette.border,
      primary: palette.accent,
      notification: palette.accentDeep,
    },
  };

  return (
    <ApiConfigProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: palette.background },
            headerStyle: { backgroundColor: palette.panel },
            headerTintColor: palette.ink,
            headerTitleStyle: { fontWeight: '800' },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="strategies" options={{ title: 'Strategies' }} />
          <Stack.Screen name="monitor" options={{ title: 'Monitor' }} />
          <Stack.Screen name="tournament" options={{ title: 'Tournament' }} />
          <Stack.Screen name="options-lab" options={{ title: 'Options Lab' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </ThemeProvider>
    </ApiConfigProvider>
  );
}
