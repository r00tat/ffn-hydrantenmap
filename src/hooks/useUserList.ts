import { useCallback, useEffect, useState } from 'react';
import { UserRecordExtended } from '../common/users';
import useFirebaseLogin from './useFirebaseLogin';
import { getUsers } from '../app/users/action';

export default function useUserList(): [
  UserRecordExtended[],
  () => Promise<void>
] {
  const { isSignedIn, user, idToken: token } = useFirebaseLogin();
  const [users, setUsers] = useState<UserRecordExtended[]>([]);

  const fetchUsers = useCallback(async () => {
    if (isSignedIn && user) {
      // const token = await user.getIdToken();
      // const response = await fetch('/api/users', {
      //   headers: {
      //     Authorization: `Bearer ${token}`,
      //   },
      // });
      // const usersResponse = await response.json();
      const usersResponse = await getUsers();
      // console.info(`users: ${JSON.stringify(usersResponse.users)}`);
      setUsers(usersResponse || []);
    }
  }, [isSignedIn, user]);

  useEffect(() => {
    // fetch users
    if (isSignedIn && user) {
      // only fetch users, if signedin
      (async () => {
        fetchUsers();
      })();
    }
    return () => {};
  }, [fetchUsers, isSignedIn, user]);

  return [users, fetchUsers];
}
