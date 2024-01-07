import { isSupported } from 'firebase/messaging';
import { useCallback, useEffect, useState } from 'react';
import { UserRecordExtended } from '../common/users';
import { registerMessaging } from '../components/firebase/messaging';
import useApiRequest from './useApiRequest';
import useFirebaseLogin from './useFirebaseLogin';

export function useFirebaseMessagingToken() {
  const [token, setToken] = useState<string>();

  useEffect(() => {
    (async () => {
      const messagingToken = await registerMessaging();
      setToken(messagingToken);
    })();
  }, []);
  return token;
}

export default function useRegisterMessaging() {
  const { isSignedIn, messagingTokens, uid, refresh } = useFirebaseLogin();
  const messagingToken = useFirebaseMessagingToken();
  const apiRequest = useApiRequest();

  return useCallback(async (): Promise<UserRecordExtended | undefined> => {
    if (!isSignedIn || !uid || !(await isSupported())) {
      return undefined;
    }

    if (
      messagingToken &&
      (messagingTokens || []).indexOf('' + messagingToken) < 0
    ) {
      const registerResponse = await apiRequest(`/users/${uid}/messaging`, {
        token: messagingToken,
      });
      console.info(
        `register messaging response: ${JSON.stringify(registerResponse)}`
      );
      await refresh();
      return registerResponse;
    }
  }, [apiRequest, isSignedIn, messagingToken, messagingTokens, refresh, uid]);
}

export function useUnRegisterMessaging() {
  const { isSignedIn, user, messagingTokens, refresh } = useFirebaseLogin();

  const apiRequest = useApiRequest();

  return useCallback(async (): Promise<UserRecordExtended | undefined> => {
    if (!isSignedIn || !user || !(await isSupported())) {
      return undefined;
    }
    const messagingToken = await registerMessaging();

    if (messagingToken || !messagingTokens) {
      const unregisterResponse = await apiRequest(
        `/users/${user.uid}/messaging`,
        {
          token: messagingToken,
        },
        'DELETE'
      );
      console.info(
        `unregister messaging response: ${JSON.stringify(unregisterResponse)}`
      );
      await refresh();
      return unregisterResponse;
    }
  }, [apiRequest, isSignedIn, messagingTokens, refresh, user]);
}
