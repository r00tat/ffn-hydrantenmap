import { useCallback } from 'react';
import { UserRecordExtended } from '../common/users';
import useFirebaseLogin from './useFirebaseLogin';

export default function useUpdateUser() {
  const { isSignedIn, user, idToken: token } = useFirebaseLogin();

  return useCallback(
    async (
      userData: UserRecordExtended
    ): Promise<UserRecordExtended | undefined> => {
      if (!isSignedIn || !user) {
        return undefined;
      }
      // console.info(`fetching users`);
      const response = await fetch(`/api/users/${userData.uid}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      const usersResponse = await response.json();
      // console.info(`users: ${JSON.stringify(usersResponse.users)}`);
      return usersResponse;
    },
    [isSignedIn, token, user]
  );
}
