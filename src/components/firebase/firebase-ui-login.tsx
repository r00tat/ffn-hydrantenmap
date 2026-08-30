'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
} from 'firebase/auth';
import * as firebaseui from 'firebaseui';
import 'firebaseui/dist/firebaseui.css';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { auth } from './firebase';
import {
  collectAuthDiagnostics,
  formatAuthDiagnostics,
  storageKeys,
} from './authDiagnostics';
import { shouldUseRedirectSignIn } from './signInStrategy';
import { claimWidgetContainer } from './widgetGuard';

export default function FirebaseUiLogin() {
  const t = useTranslations('login');
  const [error, setError] = useState<string | undefined>(undefined);

  // Diagnose des Redirect-Wegs.
  //
  // Nach der Rueckkehr von Google laedt die Seite neu. Bleibt die Anmeldung
  // dann aus, sagt allein der Browserspeicher, wie weit sie gekommen ist —
  // die Deutung der Schluessel steht in authDiagnostics.ts. Zweimal
  // protokolliert, weil das Einloesen asynchron laeuft: Der Zustand beim
  // Aufbau der Seite ist noch nicht der endgueltige.
  useEffect(() => {
    const flow: 'popup' | 'redirect' = shouldUseRedirectSignIn()
      ? 'redirect'
      : 'popup';

    // Die beiden Speicher getrennt ausgeben. FirebaseUIs Wegwerf-App gehoert
    // in die sessionStorage; steht ihr Benutzer in der localStorage, ist es
    // eine Altlast aus einem frueheren Versuch — und die fuehrt bei der
    // Deutung in die Irre.
    const snapshot = (phase: string) => {
      const common = {
        phase,
        signInFlow: flow,
        authDomain: auth.app?.options?.authDomain,
        currentUser: auth.currentUser?.uid ?? null,
        href: window.location.href,
      };
      const session = collectAuthDiagnostics({
        ...common,
        sessionKeys: storageKeys(window.sessionStorage),
        localKeys: [],
      });
      const local = collectAuthDiagnostics({
        ...common,
        sessionKeys: [],
        localKeys: storageKeys(window.localStorage),
      });
      console.info(
        `[FirebaseUiLogin] session · ${formatAuthDiagnostics(session)}`,
      );
      console.info(
        `[FirebaseUiLogin] local   · ${formatAuthDiagnostics(local)}`,
      );
    };

    snapshot('Seitenaufbau');
    const timer = setTimeout(() => snapshot('3s nach Aufbau'), 3000);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.info(
        `[FirebaseUiLogin] onAuthStateChanged: ${user ? `angemeldet als ${user.uid}` : 'kein Benutzer'}`,
      );
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const container = document.getElementById('firebaseui-auth-container');
    if (!container) return;

    // Ein zweiter Start bricht ein laufendes Einloesen ab — Begruendung in
    // widgetGuard.ts. React ruft diesen Effekt im StrictMode zweimal auf.
    if (!claimWidgetContainer(container)) {
      console.info(
        '[FirebaseUiLogin] ui.start uebersprungen (Widget laeuft bereits)',
      );
      return;
    }

    const ui =
      firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);

    console.info(
      `[FirebaseUiLogin] ui.start · isPendingRedirect=${ui.isPendingRedirect()}`,
    );

    ui.start(container, {
      callbacks: {
        signInSuccessWithAuthResult: (authResult, redirectUrl) => {
          // Action if the user is authenticated successfully
          console.info('signInSuccess', {
            uid: authResult?.user?.uid,
            providerId: authResult?.additionalUserInfo?.providerId,
            isNewUser: authResult?.additionalUserInfo?.isNewUser,
            operationType: authResult?.operationType,
            redirectUrl,
          });
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
        // Ein Fehler hier darf nicht nur in der Konsole landen.
        //
        // Beim Redirect-Weg kommt die Seite nach dem Ausflug zu Google neu
        // hoch. Scheitert dabei das Einloesen, sieht man ohne diese Meldung
        // wieder das Anmeldeformular — als waere nichts geschehen, und ohne
        // jeden Hinweis, woran es lag.
        signInFailure: function (error) {
          console.error('[FirebaseUiLogin] signInFailure', error);
          setError(
            [error?.code, error?.message].filter(Boolean).join(': ') ||
              `${error}`,
          );
          return Promise.resolve();
        },
      },
      // Popup ist der angenehmere Weg und bleibt ueberall dort, wo er
      // funktioniert. Auf iOS funktioniert er nicht: Der Auth-Handler gibt
      // sein Ergebnis per `postMessage` an `window.opener` zurueck, und
      // WebKit-Browser jenseits von Safari oeffnen `window.open` als
      // eigenstaendigen Tab ohne diese Beziehung — der Login bleibt dann auf
      // einer weissen Handler-Seite stehen. Warum der Redirect dafuer einen
      // erst-party Handler braucht, steht in signInStrategy.ts.
      signInFlow: shouldUseRedirectSignIn() ? 'redirect' : 'popup',
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
          fullLabel: 'Sign In with Email Link',
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
      // currently broken
      // credentialHelper: firebaseui.auth.CredentialHelper.GOOGLE_YOLO,
    });
  }, []);

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>{t('signInFailed')}</AlertTitle>
          {error}
        </Alert>
      )}
      <div id="firebaseui-auth-container"></div>
      <div id="loader" className="text-center">
        Lade Login...
      </div>
    </>
  );
}
