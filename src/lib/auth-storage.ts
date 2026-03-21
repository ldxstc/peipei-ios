import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { AuthUser } from './api';

const LEGACY_SESSION_COOKIE_KEY = 'peipei.session_cookie';
const SESSION_TOKEN_KEY = 'peipei.session_token';
const SESSION_USER_KEY = 'peipei.session_user';

function normalizeStoredSessionToken(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  const cookieMatch = rawValue.match(
    /(?:__Secure-)?peipei\.session_token=([^;,\s]+)/,
  );

  if (cookieMatch?.[1]) {
    return cookieMatch[1];
  }

  const normalized = rawValue.trim();
  return normalized || null;
}

function isStoredAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    typeof record.email === 'string' &&
    (typeof record.name === 'string' || record.name === null)
  );
}

export async function getStoredSessionToken() {
  const [storedToken, legacyCookie] = await Promise.all([
    SecureStore.getItemAsync(SESSION_TOKEN_KEY),
    SecureStore.getItemAsync(LEGACY_SESSION_COOKIE_KEY),
  ]);

  const normalizedToken =
    normalizeStoredSessionToken(storedToken) ??
    normalizeStoredSessionToken(legacyCookie);

  if (normalizedToken && normalizedToken !== storedToken) {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, normalizedToken);
  }

  if (legacyCookie) {
    await SecureStore.deleteItemAsync(LEGACY_SESSION_COOKIE_KEY);
  }

  return normalizedToken;
}

export async function setStoredSessionToken(token: string) {
  await Promise.all([
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, token),
    SecureStore.deleteItemAsync(LEGACY_SESSION_COOKIE_KEY),
  ]);
}

export async function deleteStoredSessionToken() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
    SecureStore.deleteItemAsync(LEGACY_SESSION_COOKIE_KEY),
  ]);
}

export async function getStoredSessionUser() {
  const rawUser = await AsyncStorage.getItem(SESSION_USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as unknown;
    return isStoredAuthUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setStoredSessionUser(user: AuthUser) {
  return AsyncStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export async function deleteStoredSessionUser() {
  return AsyncStorage.removeItem(SESSION_USER_KEY);
}
