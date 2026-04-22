'use server';
import 'server-only';

import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { signIn, signOut } from './auth';

export async function firebaseTokenLogin(token: string) {
  try {
    const result = await signIn('credentials', {
      firebaseToken: token,
      redirect: false,
    });
    console.info(`login completed`);
    return result;
  } catch (err) {
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

