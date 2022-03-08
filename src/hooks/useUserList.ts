import { UserRecord } from 'firebase-admin/lib/auth/user-record';
import { useEffect, useState, useCallback } from 'react';
import { UserRecordExtended } from '../pages/api/users';
import useFirebaseLogin from './useFirebaseLogin';

export default function useUserList(): [
  UserRecordExtended[],
  () => Promise<void>
] {
  const { isSignedIn, user } = useFirebaseLogin();
  const [users, setUsers] = useState<UserRecordExtended[]>([]);

  const fetchUsers = useCallback(async () => {
    if (isSignedIn && user) {
      const token = await user.getIdToken();
      const response = await fetch('/api/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const usersResponse = await response.json();
      // console.info(`users: ${JSON.stringify(usersResponse.users)}`);
      setUsers(usersResponse?.users || []);
    }
  }, [isSignedIn, user]);

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
