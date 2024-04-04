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
