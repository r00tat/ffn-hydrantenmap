'use client';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { useGoogleOneTapLogin } from 'react-google-one-tap-login';
import { IGoogleOneTapLoginProps } from 'react-google-one-tap-login/dist/types/types';

export default function OneTapLogin() {
  const auth = getAuth();

  useGoogleOneTapLogin({
    onError: () => console.log('onetap error'),
    onSuccess: () => console.log('onetap success'),
    googleAccountConfigs: {
      client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'err',
      use_fedcm_for_prompt: true,
      callback: async (data: any) => {
        console.info('onetap login successful');
        await signInWithCredential(
          auth,
          GoogleAuthProvider.credential(data.credential)
        );
        console.info('firebase auth completed');
      },
      auto_select: true,
    } as unknown as IGoogleOneTapLoginProps,
  });

  return null;
}
