import dynamic from 'next/dynamic';
import useFirebaseLogin from '../hooks/useFirebaseLogin';

const DynamicOneTapLogin = dynamic(
  () => {
    return import('./OneTapLogin');
  },
  { ssr: false }
);

export default function SingedOutOneTapLogin() {
  const { isSignedIn } = useFirebaseLogin();

  return <>{!isSignedIn && <DynamicOneTapLogin />}</>;
}
