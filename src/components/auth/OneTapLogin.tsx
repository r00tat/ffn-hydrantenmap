'use client';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useGoogleOneTapLogin } from 'react-google-one-tap-login';
import { IGoogleOneTapLoginProps } from 'react-google-one-tap-login/dist/types/types';

export function OneTapLoginOnClient() {
  const auth = getAuth();

  useGoogleOneTapLogin({
    onError: (error) => console.log(error),
    onSuccess: (response) => console.log(response),
    googleAccountConfigs: {
      client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'err',
      use_fedcm_for_prompt: true,
      callback: async (data: any) => {
        // console.info(`login callback`, data);
        console.info('onetap login succesfull');
        const credentials = await signInWithCredential(
          auth,
          GoogleAuthProvider.credential(data.credential)
        );
        console.info(`firebase auth completed`);
      },

      auto_select: true,
    } as unknown as IGoogleOneTapLoginProps,
  });
  return <></>;
}

export default function OneTapLogin() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoaded(true);
    })();
  }, []);

  {
    isLoaded && <OneTapLoginOnClient />;
  }

  return <></>;
}
