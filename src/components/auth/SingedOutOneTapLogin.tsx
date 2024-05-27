'use client';

import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import DynamicOneTapLogin from './OneTapLogin';

export default function SingedOutOneTapLogin() {
  const { isSignedIn } = useFirebaseLogin();

  return <>{!isSignedIn && <DynamicOneTapLogin />}</>;
}
