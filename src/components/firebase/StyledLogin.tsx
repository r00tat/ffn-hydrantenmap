import { Auth, EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import * as firebaseui from 'firebaseui';
import 'firebaseui/dist/firebaseui.css';
import { useEffect } from 'react';

const uiConfig: firebaseui.auth.Config = {
  signInOptions: [
    GoogleAuthProvider.PROVIDER_ID,
    EmailAuthProvider.PROVIDER_ID,
  ],
  signInFlow: 'popup',
  // autoUpgradeAnonymousUsers: true,
  callbacks: {
    signInSuccessWithAuthResult: (authResult) => {
      console.info(`firebaseui login success`, authResult);
      return false;
    },
  },
};

export default function StyledLoginButton({
  firebaseAuth: auth,
}: {
  firebaseAuth: Auth;
}) {
  useEffect(() => {
    var ui =
      firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);
    // The start method will wait until the DOM is loaded.
    ui.start('#firebaseui-auth-container', uiConfig);

    // return () => {
    //   ui.delete();
    // };
  }, [auth]);

  return (
    <>
      <div id="firebaseui-auth-container"></div>
    </>
  );
}
