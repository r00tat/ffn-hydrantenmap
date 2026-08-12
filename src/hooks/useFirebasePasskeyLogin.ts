'use client';

import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { startAuthentication } from '@simplewebauthn/browser';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { useCallback, useState } from 'react';
import {
  finishPasskeyAuthentication,
  startPasskeyAuthentication,
} from '../app/actions/passkey';

/**
 * Passkey-Login: WebAuthn-Ceremony im Browser, Verifikation serverseitig, und
 * am Ende dasselbe Firebase Custom Token wie beim Gast-Link-Login. Ab dort
 * übernimmt der bestehende Login-Observer (Firebase ID Token → NextAuth).
 */
export function useFirebasePasskeyLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { options, challengeToken } = await startPasskeyAuthentication();
      const response = await startAuthentication({ optionsJSON: options });
      const { token } = await finishPasskeyAuthentication(
        challengeToken,
        response,
      );

      await signInWithCustomToken(getAuth(), token);
      console.info('signed in with passkey');

      // Dasselbe Token zusätzlich nativ einlösen: die Foreground-Services
      // (Radiacode-Tracking, Live-Standort) schreiben am WebView vorbei und
      // brauchen eine native Firebase-Session. Ein Custom Token ist mehrfach
      // einlösbar — identisches Vorgehen wie in useFirebaseCustomTokenLogin.
      if (Capacitor.isNativePlatform()) {
        try {
          await FirebaseAuthentication.signInWithCustomToken({
            token,
            skipNativeAuth: false,
          });
          console.info('native firebase auth signed in with passkey token');
        } catch (nativeErr) {
          console.error(
            'native signInWithCustomToken failed (tracking may not work)',
            nativeErr,
          );
        }
      }
      return true;
    } catch (err) {
      // Bricht der Nutzer den Systemdialog ab oder findet der Authenticator
      // keinen passenden Passkey, wirft der Browser NotAllowedError. Das ist
      // kein Fehlerzustand, der als Fehlermeldung angezeigt werden muss.
      if ((err as Error)?.name !== 'NotAllowedError') {
        setError(err as Error);
        console.error('passkey login failed', err);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { login, loading, error };
}
