import Button from '@mui/material/Button';
import {
  FacebookAuthProvider,
  getAdditionalUserInfo,
  getAuth,
  signInWithPopup,
} from 'firebase/auth';
import { useCallback, useMemo } from 'react';

export default function FacebookLoginButton() {
  const provider = useMemo<FacebookAuthProvider>(() => {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    provider.setCustomParameters({
      display: 'popup',
    });
    return provider;
  }, []);

  const signIn = useCallback(async () => {
    try {
      const auth = getAuth();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userInfo = getAdditionalUserInfo(result);
      console.info(`facebook user`, user, userInfo);

      // This gives you a Facebook Access Token. You can use it to access the Facebook API.
      const credential = FacebookAuthProvider.credentialFromResult(result);
      console.info(`facebook credentials`, credential);
      // const accessToken = credential.accessToken;
    } catch (err) {
      console.error(`login failed`, err, (err as any)?.customData);
    }
  }, [provider]);

  return (
    <>
      <Button
        onClick={signIn}
        color="primary"
        variant="contained"
        style={{ marginLeft: 20 }}
      >
        Facebook Login
      </Button>
    </>
  );
}
