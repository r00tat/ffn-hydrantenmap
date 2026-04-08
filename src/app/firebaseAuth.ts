'use server';
import 'server-only';

import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { signIn, signOut } from './auth';
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

