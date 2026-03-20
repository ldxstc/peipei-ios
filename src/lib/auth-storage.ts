import * as SecureStore from 'expo-secure-store';

const SESSION_COOKIE_KEY = 'peipei.session_cookie';

export async function getStoredSessionCookie() {
  return SecureStore.getItemAsync(SESSION_COOKIE_KEY);
}

export async function setStoredSessionCookie(cookie: string) {
  return SecureStore.setItemAsync(SESSION_COOKIE_KEY, cookie);
}

export async function deleteStoredSessionCookie() {
  return SecureStore.deleteItemAsync(SESSION_COOKIE_KEY);
}
