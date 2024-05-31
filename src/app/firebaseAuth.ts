'use server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { ApiException } from './api/errors';
import { auth, signIn, signOut } from './auth';

export async function firebaseTokenLogin(token: string) {
  try {
    const result = await signIn('credentials', {
      firebaseToken: token,
      redirect: false,
    });
    console.info(`login result: ${JSON.stringify(result)}`);
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

export async function checkAuth() {
  const session = await auth();
  console.info(`checkAuth: '${JSON.stringify(session)}'`);
  if (!session) throw new ApiException('authorization failed', { status: 403 });
  return session;
}
