'use client';

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  sendEmailVerification,
} from 'firebase/auth';
import * as firebaseui from 'firebaseui';
import 'firebaseui/dist/firebaseui.css';
import { useEffect } from 'react';
import { auth } from './firebase';

export default function FirebaseUiLogin() {
  useEffect(() => {
    const ui =
      firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);

    ui.start('#firebaseui-auth-container', {
      callbacks: {
        signInSuccessWithAuthResult: (authResult, redirectUrl) => {
          // Action if the user is authenticated successfully
          console.info(`signInSuccess`, authResult, redirectUrl);
          if (authResult.additionalUserInfo?.isNewUser) {
            console.info(`register successfull!`);
            sendEmailVerification(auth.currentUser!);
          }
          return false;
        },
        uiShown: function () {
          // This is what should happen when the form is full loaded. In this example, I hide the loader element.
          document.getElementById('loader')!.style.display = 'none';
        },
        signInFailure: function (error) {
          console.warn('signInFailure', error);
        },
      },
      signInFlow: 'popup',
      // signInSuccessUrl: 'https://www.anyurl.com', // This is where should redirect if the sign in is successful.
      signInOptions: [
        {
          provider: GoogleAuthProvider.PROVIDER_ID,
          // scopes: ['https://www.googleapis.com/auth/contacts.readonly'],
          clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID,
        },
        {
          provider: EmailAuthProvider.PROVIDER_ID,
          providerName: 'Email',
          requireDisplayName: true,
          // disableSignUp: {
          //   status: true,
          // },
        },
        {
          provider: EmailAuthProvider.PROVIDER_ID,
          signInMethod: EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD,
          providerName: 'Email Link',
          fullLabel: 'Singn In with Email Link',
          requireDisplayName: true,
          // disableSignUp: {
          //   status: true,
          // },
        },
      ],
      tosUrl: 'https://einsatz.ffnd.at', // URL to you terms and conditions.
      privacyPolicyUrl: function () {
        // URL to your privacy policy
        window.location.assign('https://www.einsatz.ffnd.at');
      },
      // Required to enable one-tap sign-up credential helper.
      credentialHelper: firebaseui.auth.CredentialHelper.GOOGLE_YOLO,
    });
  }, []);

  return (
    <>
      <div id="firebaseui-auth-container"></div>
      <div id="loader" className="text-center">
        Lade Login...
      </div>
    </>
  );
}
