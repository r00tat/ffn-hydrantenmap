import { useContext } from 'react';
import { FirebaseLoginContext } from '../components/FirebaseUserProvider';
import { LoginStatus } from './useFirebaseLoginObserver';

const useFirebaseLogin = (): LoginStatus => {
  return useContext(FirebaseLoginContext);
};

export default useFirebaseLogin;
