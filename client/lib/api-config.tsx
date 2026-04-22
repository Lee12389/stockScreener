import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'stockscreener.api-base-url.v1';

type ApiConfigContextValue = {
  apiBaseUrl: string;
  defaultApiBaseUrl: string;
  ready: boolean;
  setApiBaseUrl: (value: string) => Promise<void>;
  resetApiBaseUrl: () => Promise<void>;
};

const ApiConfigContext = createContext<ApiConfigContextValue | null>(null);

/** Normalizes API base URLs by trimming whitespace and trailing slashes. */
function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** Infers the Expo development host so physical devices can reach the laptop backend. */
function inferDevHost(): string | null {
  const config = Constants.expoConfig as { hostUri?: string } | null;
  const hostUri = config?.hostUri;
  if (!hostUri) {
    return null;
  }
  const [host] = hostUri.split(':');
  return host || null;
}

/** Resolves the default backend URL for web, simulator, and device environments. */
export function resolveDefaultApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    return normalizeBaseUrl(envUrl);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.hostname || '127.0.0.1';
    return `http://${host}:5015`;
  }

  const inferredHost = inferDevHost();
  if (inferredHost && inferredHost !== 'localhost') {
    return `http://${inferredHost}:5015`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5015';
  }

  return 'http://127.0.0.1:5015';
}

/** Provides a persisted API base URL to all Expo screens. */
export function ApiConfigProvider({ children }: PropsWithChildren) {
  const defaultApiBaseUrl = resolveDefaultApiBaseUrl();
  const [apiBaseUrl, setApiBaseUrlState] = useState(defaultApiBaseUrl);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) {
          return;
        }
        if (stored) {
          setApiBaseUrlState(normalizeBaseUrl(stored));
        } else {
          setApiBaseUrlState(defaultApiBaseUrl);
        }
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setApiBaseUrlState(defaultApiBaseUrl);
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [defaultApiBaseUrl]);

  async function setApiBaseUrl(value: string) {
    const normalized = normalizeBaseUrl(value);
    await AsyncStorage.setItem(STORAGE_KEY, normalized);
    setApiBaseUrlState(normalized);
  }

  async function resetApiBaseUrl() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setApiBaseUrlState(defaultApiBaseUrl);
  }

  return (
    <ApiConfigContext.Provider
      value={{
        apiBaseUrl,
        defaultApiBaseUrl,
        ready,
        setApiBaseUrl,
        resetApiBaseUrl,
      }}>
      {children}
    </ApiConfigContext.Provider>
  );
}

/** Returns the active API configuration from context. */
export function useApiConfig() {
  const value = useContext(ApiConfigContext);
  if (!value) {
    throw new Error('useApiConfig must be used within ApiConfigProvider');
  }
  return value;
}
