'use client';

import { auth } from '../../components/firebase/firebase';
import { firebaseTokenLogin } from '../../app/firebaseAuth';

const TOKEN_MIN_LIFETIME_MS = 5 * 60 * 1000;

let inflightAny: Promise<boolean> | null = null;
let inflightForce: Promise<boolean> | null = null;

function isAuthError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (typeof code === 'string') {
    if (
      code === 'permission-denied' ||
      code === 'unauthenticated' ||
      code.startsWith('auth/')
    ) {
      return true;
    }
  }
  const message = (err as { message?: string } | null)?.message || '';
  return (
    /permission[-_ ]denied/i.test(message) ||
    /unauthenticated/i.test(message) ||
    /missing or insufficient permissions/i.test(message)
  );
}

async function doEnsure(forceServerLogin: boolean): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const tokenResult = await user.getIdTokenResult();
  const expirationMs = Date.parse(tokenResult.expirationTime);
  const needsTokenRefresh =
    Number.isNaN(expirationMs) ||
    expirationMs - Date.now() < TOKEN_MIN_LIFETIME_MS;

  if (needsTokenRefresh) {
    await user.getIdToken(true);
  }

  if (needsTokenRefresh || forceServerLogin) {
    const token = await user.getIdToken();
    if (!token) return false;
    const result = await firebaseTokenLogin(token);
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      console.warn('ensureFreshAuth: firebaseTokenLogin failed', result.error);
      return false;
    }
  }
  return true;
}

/**
 * Ensure the Firebase ID token is valid and the NextAuth session is fresh.
 * De-duplicates concurrent callers per force-level: a forced caller never
 * rides on a non-forced inflight promise, but a non-forced caller will ride
 * on an inflight forced promise because force is stricter.
 * Only performs network work when the current token is close to expiring
 * (unless `forceServerLogin` is true).
 * Returns false when refreshing failed so callers can decide what to do.
 */
export async function ensureFreshAuth(
  forceServerLogin = false,
): Promise<boolean> {
  if (forceServerLogin) {
    if (inflightForce) return inflightForce;
    inflightForce = doEnsure(true).catch((err) => {
      console.error('ensureFreshAuth failed', err);
      return false;
    });
    try {
      return await inflightForce;
    } finally {
      inflightForce = null;
    }
  }

  // Non-force callers ride on a force promise if one is running (force is stricter).
  if (inflightForce) return inflightForce;
  if (inflightAny) return inflightAny;
  inflightAny = doEnsure(false).catch((err) => {
    console.error('ensureFreshAuth failed', err);
    return false;
  });
  try {
    return await inflightAny;
  } finally {
    inflightAny = null;
  }
}

export { isAuthError };
