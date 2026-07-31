import 'server-only';

import { getAppCheck } from 'firebase-admin/app-check';
import { firebaseApp } from './admin';

/**
 * Shape the Firebase JS SDK's `CustomProvider` expects back from
 * `getToken()` — an already exchanged App Check token plus its absolute
 * expiry, so the SDK can schedule its own refresh.
 */
export interface AppCheckTokenResponse {
  token: string;
  expireTimeMillis: number;
}

/**
 * Shortest TTL the App Check API accepts. Kept at the minimum because these
 * tokens are handed to a Chrome extension, which cannot attest itself — a
 * short lifetime limits how long a leaked token stays usable.
 */
const TOKEN_TTL_MILLIS = 30 * 60 * 1000;

/**
 * The Firebase app the minted token attests. Defaults to the web app from
 * `NEXT_PUBLIC_FIREBASE_APIKEY`, which the extension shares — set
 * `APPCHECK_APP_ID` to attest a separately registered app instead.
 */
export function resolveAppCheckAppId(): string {
  const explicit = process.env.APPCHECK_APP_ID?.trim();
  if (explicit) {
    return explicit;
  }

  let appId: unknown;
  try {
    appId = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}')?.appId;
  } catch {
    // Fall through to the error below — an unparsable config is no app id.
  }

  if (typeof appId !== 'string' || !appId) {
    throw new Error(
      'no App Check app id available: set APPCHECK_APP_ID or provide appId in NEXT_PUBLIC_FIREBASE_APIKEY'
    );
  }
  return appId;
}

/**
 * Mint an App Check token via the Admin SDK.
 *
 * This is the backend half of a custom App Check provider. It exists for the
 * Chrome extension: App Check has no attestation provider for extensions —
 * reCAPTCHA Enterprise needs an allowed web origin and a DOM, neither of which
 * a `chrome-extension://` service worker has. The extension therefore proves
 * itself with a verified Firebase ID token of an authorized user and receives a
 * short-lived App Check token in exchange.
 *
 * Note what this does and does not guarantee: the token attests "a request from
 * an authorized user of this project", not "an untampered copy of our app".
 * That is the inherent ceiling for browser extensions.
 */
export async function createAppCheckToken(): Promise<AppCheckTokenResponse> {
  const appId = resolveAppCheckAppId();
  const { token, ttlMillis } = await getAppCheck(firebaseApp).createToken(
    appId,
    { ttlMillis: TOKEN_TTL_MILLIS }
  );

  return { token, expireTimeMillis: Date.now() + ttlMillis };
}
