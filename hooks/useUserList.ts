import { UserRecord } from 'firebase-admin/lib/auth/user-record';
import { useEffect, useState } from 'react';
import useFirebaseLogin from './useFirebaseLogin';

export default function useUserList() {
  const { isSignedIn, user } = useFirebaseLogin();
  const [users, setUsers] = useState<UserRecord[]>([]);

  useEffect(() => {
    // fetch users
    if (isSignedIn && user) {
      // only fetch users, if signedin
      (async () => {
        // console.info(`fetching users`);
        const token = await user.getIdToken();
        const response = await fetch('/api/users', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const usersResponse = await response.json();
        // console.info(`users: ${JSON.stringify(usersResponse.users)}`);
        setUsers(usersResponse?.users || []);
      })();
    }
    return () => {};
  }, [isSignedIn, user]);

  return users;
}
