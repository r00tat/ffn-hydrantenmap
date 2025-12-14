import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { exchangeCustomJwtForFirebaseToken } from '../app/actions/auth';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useFirebaseCustomTokenLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    const auth = getAuth();
    console.info(`token: ${token}`);

    if (token) {
      (async () => {
        await wait(500);
        if (!auth.currentUser) {
          console.info('no user, so starting login with token');
          setLoading(true);
          setError(null);
          try {
            const { token: firebaseToken, error } =
              await exchangeCustomJwtForFirebaseToken(token);
            if (!firebaseToken) {
              throw new Error(`Invalid token: ${error}`);
            }
            const result = await signInWithCustomToken(auth, firebaseToken);
            console.info(
              `signedin with custom token: ${result.user.uid} ${result.user.displayName}`
            );
          } catch (err) {
            setError(err as Error);
            console.error(`token auth failed: ${err}`);
          } finally {
            setLoading(false);
          }
        }
      })();
    }
  }, [token]);

  return { loading, error };
}
