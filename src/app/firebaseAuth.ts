'use server';
import 'server-only';

import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { ApiException } from './api/errors';
import { auth, signIn, signOut } from './auth';
import { serverLoginTimer } from '../common/loginTiming';

export async function firebaseTokenLogin(token: string) {
  const timer = serverLoginTimer('firebaseTokenLogin');
  try {
    timer.step('signIn(credentials)');
    const result = await signIn('credentials', {
      firebaseToken: token,
      redirect: false,
    });
    timer.done();
    console.info(`login completed`);
    return result;
  } catch (err) {
    timer.done();
    console.error(`signin failed: ${err} ${(err as unknown as any)?.stack}`);

    if (isRedirectError(err)) {
      throw err;
    }
    return { error: `${err}` };
  }
}

export async function authJsLogout() {
  return signOut({ redirect: false });
}

export async function checkAuth() {
  const session = await auth();
  console.info(`checkAuth: ${session ? 'session present' : 'no session'}`);
  if (!session) throw new ApiException('authorization failed', { status: 403 });
  return session;
}
