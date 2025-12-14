import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { firebaseApp } from '../components/firebase/firebase';
import { useEffect } from 'react';

export default function useFirebaseAppCheck() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_RECAPTCHA_KEY) {
      const appCheck = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(
          process.env.NEXT_PUBLIC_RECAPTCHA_KEY || ''
        ),
        isTokenAutoRefreshEnabled: true, // Set to true to allow auto-refresh.
      });
      console.info('app check initialized.', appCheck);
    }
  }, []);
}
