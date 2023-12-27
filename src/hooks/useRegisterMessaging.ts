import { useCallback } from 'react';
import { UserRecordExtended } from '../common/users';
import useFirebaseLogin from './useFirebaseLogin';
import { registerMessaging } from '../components/firebase/messaging';

export default function useRegisterMessaging() {
  const { isSignedIn, user } = useFirebaseLogin();

  return useCallback(
    async (
    ): Promise<UserRecordExtended | undefined> => {
      if (!isSignedIn || !user) {
        return undefined;
      }
      
      const token = await registerMessaging();
      const response = await fetch(`/api/users/${user.uid}/messaging`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
        }),
      });
      const registerResponse = await response.json();
      console.info(`register messaging response: ${JSON.stringify(registerResponse)}`);
      return registerResponse;
    },
    [isSignedIn, user]
  );
}
