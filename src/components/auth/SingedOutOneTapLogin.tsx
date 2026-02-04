'use client';

import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import DynamicOneTapLogin from './OneTapLogin';

export default function SingedOutOneTapLogin() {
  const { isSignedIn, isAuthLoading } = useFirebaseLogin();

  // Don't show One-Tap while auth state is loading to prevent FedCM abort errors
  if (isAuthLoading) {
    return null;
  }

  return <>{!isSignedIn && <DynamicOneTapLogin />}</>;
}
