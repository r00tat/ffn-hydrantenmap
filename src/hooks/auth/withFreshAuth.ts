'use client';

import { ensureFreshAuth, isAuthError } from './ensureFreshAuth';

/**
 * Execute a Firestore (or other auth-gated) operation after making sure the
 * current session is fresh. If the operation fails with an auth error we
 * retry exactly once after forcing a full auth refresh, so a token that went
 * stale during standby is renewed transparently.
 */
export async function withFreshAuth<T>(op: () => Promise<T>): Promise<T> {
  await ensureFreshAuth();
  try {
    return await op();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    console.warn('auth-related error, retrying after forced refresh', err);
    const refreshed = await ensureFreshAuth(true);
    if (!refreshed) throw err;
    return await op();
  }
}
