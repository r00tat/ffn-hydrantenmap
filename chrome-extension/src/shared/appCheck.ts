import type { FirebaseApp } from 'firebase/app';
import {
  type AppCheck,
  type AppCheckToken,
  CustomProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import type { Auth } from 'firebase/auth';
import { EINSATZKARTE_URL } from './config';

export const APPCHECK_ENDPOINT = `${EINSATZKARTE_URL}/api/appcheck`;

type FetchLike = typeof fetch;

/**
 * Fetch an App Check token from the Einsatzkarte backend.
 *
 * App Check has no attestation provider for Chrome extensions: reCAPTCHA
 * Enterprise needs an allowed web origin plus a DOM, and an MV3 service worker
 * has neither (its CSP also forbids the remote reCAPTCHA script). The extension
 * therefore identifies itself with the signed-in user's Firebase ID token and
 * the backend mints a short-lived App Check token for it.
 *
 * The request relies on plain CORS — the backend allows this extension's origin
 * in `src/proxy.ts`. Deliberately no `host_permissions` entry: adding one to a
 * published extension makes Chrome disable it until every user re-approves.
 */
export async function fetchAppCheckToken(
  auth: Auth,
  fetchImpl: FetchLike = fetch
): Promise<AppCheckToken> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('cannot fetch app check token: no signed in user');
  }

  const idToken = await user.getIdToken();
  const response = await fetchImpl(APPCHECK_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `app check token request failed with status ${response.status}`
    );
  }

  const data = await response.json();
  if (!data?.token) {
    throw new Error('app check token response contained no token');
  }

  return {
    token: data.token,
    expireTimeMillis: data.expireTimeMillis,
  };
}

/**
 * Initialize App Check for an extension context (background worker or popup).
 *
 * Failures are swallowed on purpose. While App Check enforcement is off, an
 * uninitialized App Check only means requests stay unverified; breaking the
 * whole extension over it would be the worse trade. The same holds once
 * enforcement is on — Firestore rules still gate every request.
 */
export function initExtensionAppCheck(
  app: FirebaseApp,
  auth: Auth,
  fetchImpl: FetchLike = fetch
): AppCheck | undefined {
  try {
    return initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => fetchAppCheckToken(auth, fetchImpl),
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('app check initialization failed', err);
    return undefined;
  }
}
