import { LoginData } from './types';

const SESSION_STORAGE_AUTH_KEY = 'fbAuth';

/**
 * Load auth data from session storage if valid
 */
export function loadAuthFromSessionStorage(): LoginData | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  const authText = window.sessionStorage.getItem(SESSION_STORAGE_AUTH_KEY);
  if (!authText) {
    return null;
  }

  try {
    const auth: LoginData = JSON.parse(authText);
    if (auth.expiration && new Date(auth.expiration) > new Date()) {
      return auth;
    }
  } catch {
    // Invalid JSON, ignore
  }

  return null;
}

/**
 * Save auth data to session storage
 */
export function saveAuthToSessionStorage(loginStatus: LoginData): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  if (
    loginStatus.isAuthorized &&
    !loginStatus.isRefreshing &&
    loginStatus.expiration &&
    new Date(loginStatus.expiration) > new Date()
  ) {
    window.sessionStorage.setItem(
      SESSION_STORAGE_AUTH_KEY,
      JSON.stringify(loginStatus)
    );
  }
}

/**
 * Clear auth data from session storage
 */
export function clearAuthFromSessionStorage(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(SESSION_STORAGE_AUTH_KEY);
}
