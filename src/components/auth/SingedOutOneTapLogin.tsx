'use client';

import { useEffect, useState } from 'react';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { isCapacitorNative } from '../firebase/googleAuthAdapter';
import DynamicOneTapLogin from './OneTapLogin';

export default function SingedOutOneTapLogin() {
  const { isSignedIn, isAuthLoading } = useFirebaseLogin();
  const [isNative, setIsNative] = useState<boolean | null>(null);

  useEffect(() => {
    isCapacitorNative().then(setIsNative);
  }, []);

  // FedCM / One-Tap funktioniert nicht im Capacitor-WebView
  if (isNative === null || isNative) {
    return null;
  }

  // Don't show One-Tap while auth state is loading to prevent FedCM abort errors
  if (isAuthLoading) {
    return null;
  }

  return <>{!isSignedIn && <DynamicOneTapLogin />}</>;
}
