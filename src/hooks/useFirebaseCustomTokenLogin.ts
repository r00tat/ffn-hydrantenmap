import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { exchangeCustomJwtForFirebaseToken } from '../app/actions/auth';

export function useFirebaseCustomTokenLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const auth = getAuth();
    console.info(`token login: ${token ? 'token present' : 'no token'}`);

    if (!token) return;

    // Always attempt login when a token is in the URL - this is an explicit
    // user intent (e.g. shared link). Don't skip based on auth.currentUser
    // as it may be a stale session from a previous visit.
    console.info('starting login with token from URL');
    setLoading(true);
    setError(null);

    const runLogin = async () => {
      const { token: firebaseToken, error } =
        await exchangeCustomJwtForFirebaseToken(token);
      if (!firebaseToken) {
        throw new Error(`Invalid token: ${error}`);
      }
      await signInWithCustomToken(auth, firebaseToken);
      console.info('signed in with custom token');
    };

    (async () => {
      try {
        await runLogin();

        // as the token will expire after one hour, we need to make sure we login again every 45 min
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(runLogin, 1000 * 60 * 45);
      } catch (err) {
        setError(err as Error);
        console.error(`token auth failed: ${err}`);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [token]);

  return { loading, error };
}
