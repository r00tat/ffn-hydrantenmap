import { useCallback } from 'react';
import useFirebaseLogin from './useFirebaseLogin';

export default function useApiRequest() {
  const { isSignedIn, user } = useFirebaseLogin();
  return useCallback(
    async (url: string, body: any, method = 'POST') => {
      if (isSignedIn && user) {
        const token = await user.getIdToken();
        const response = await fetch(`/api/${url.replace(/^\//, '')}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const registerResponse = await response.json();
        return registerResponse;
      } else {
        throw new Error('user is not loggedin, missing ID token');
      }
    },
    [isSignedIn, user]
  );
}
