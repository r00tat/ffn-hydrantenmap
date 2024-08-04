import { useCallback, useEffect, useState } from 'react';
import { UserRecordExtended } from '../common/users';
import useFirebaseLogin from './useFirebaseLogin';

export default function useUserList(): [
  UserRecordExtended[],
  () => Promise<void>
] {
  const { isSignedIn, user, idToken: token } = useFirebaseLogin();
  const [users, setUsers] = useState<UserRecordExtended[]>([]);

  const fetchUsers = useCallback(async () => {
    if (isSignedIn && user) {
      console.info(`user`, user);
      const response = await fetch('/api/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const usersResponse = await response.json();
      // console.info(`users: ${JSON.stringify(usersResponse.users)}`);
      setUsers(usersResponse?.users || []);
    }
  }, [isSignedIn, token, user]);

  useEffect(() => {
    // fetch users
    if (isSignedIn && user) {
      // only fetch users, if signedin
      fetchUsers();
    }
    return () => {};
  }, [fetchUsers, isSignedIn, user]);

  return [users, fetchUsers];
}
