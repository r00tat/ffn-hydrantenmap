import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { auth } from '@shared/firebase';

export interface UserClaims {
  groups: string[];
  firecall?: string;
  isAuthorized: boolean;
  isAdmin: boolean;
}

const defaultClaims: UserClaims = {
  groups: [],
  isAuthorized: false,
  isAdmin: false,
};

/**
 * Read custom claims (groups, firecall, authorized, isAdmin) from the
 * Firebase ID token. Refreshes whenever the auth state changes.
 */
export function useUserClaims(): UserClaims & { loading: boolean } {
  const [claims, setClaims] = useState<UserClaims>(defaultClaims);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user: User | null) => {
      if (!user) {
        setClaims(defaultClaims);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const c = tokenResult.claims;
        setClaims({
          groups: (c.groups as string[]) || [],
          firecall: c.firecall as string | undefined,
          isAuthorized:
            (c.authorized as boolean) ||
            (user.email?.endsWith('@ff-neusiedlamsee.at') ?? false),
          isAdmin: (c.isAdmin as boolean) || false,
        });
      } catch (err) {
        console.error('Failed to read user claims', err);
        setClaims(defaultClaims);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { ...claims, loading };
}
