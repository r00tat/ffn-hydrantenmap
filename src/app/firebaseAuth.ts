'use server';
import { ApiException } from './api/errors';
import { signIn, signOut, auth } from './auth';

export async function firebaseTokenLogin(token: string) {
  return signIn('credentials', { firebaseToken: token });
}

export async function authJsLogout() {
  return signOut();
}

export async function checkAuth() {
  const session = await auth();
  console.info(`checkAuth: '${JSON.stringify(session)}'`);
  if (!session) throw new ApiException('authorization failed', { status: 403 });
  return session;
}
