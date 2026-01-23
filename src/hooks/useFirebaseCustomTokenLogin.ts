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
    console.info(`token login: ${token ? 'token present' : 'no token'}`);

    if (token) {
      (async () => {
        await wait(500);
        if (!auth.currentUser) {
          console.info('no user, so starting login with token');
          setLoading(true);
          setError(null);
          const runLogin = async () => {
            const { token: firebaseToken, error } =
              await exchangeCustomJwtForFirebaseToken(token);
            if (!firebaseToken) {
              throw new Error(`Invalid token: ${error}`);
            }
            const result = await signInWithCustomToken(auth, firebaseToken);
            console.info(`signed in with custom token`);
          };
          try {
            await runLogin();

            // as the token will expire after one hour, we need to make sure we login again every 45 min
            setInterval(runLogin, 1000 * 60 * 45);
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
