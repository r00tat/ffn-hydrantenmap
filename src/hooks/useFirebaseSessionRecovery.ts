'use client';

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { signInWithCustomToken } from 'firebase/auth';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import {
  createFirebaseTokenForSession,
  exchangeNativeIdTokenForFirebaseToken,
} from '../app/actions/auth';
import { auth } from '../components/firebase/firebase';

/** Woher das Custom Token kam — entscheidet, was danach noch zu tun ist. */
type TokenSource = 'native' | 'session';

interface RecoveredToken {
  token: string;
  source: TokenSource;
}

/**
 * Holt ein Token aus der **nativen** Firebase-Sitzung.
 *
 * Unter Android laufen zwei Firebase-Clients nebeneinander, und nur das
 * native SDK haelt seine Anmeldung zuverlaessig: ein logcat des betroffenen
 * Geraets zeigt den Benutzer 270 ms nach jedem Prozessstart wieder, offline
 * aus der lokalen Persistenz, waehrend die WebView ohne Benutzer hochkommt.
 * Dieser Weg traegt deshalb auch dann noch, wenn das NextAuth-Cookie laengst
 * abgelaufen ist — der Fall, in dem der Benutzer sich bisher von Hand neu
 * anmelden musste, obwohl eine gueltige Anmeldung danebenlag.
 */
async function tokenFromNativeSession(): Promise<string | undefined> {
  if (!Capacitor.isNativePlatform()) {
    return undefined;
  }
  try {
    const { user } = await FirebaseAuthentication.getCurrentUser();
    if (!user) {
      return undefined;
    }
    const { token: idToken } = await FirebaseAuthentication.getIdToken();
    const { token, error } =
      await exchangeNativeIdTokenForFirebaseToken(idToken);
    if (!token) {
      // Kein Abbruch: Das Cookie kann trotzdem noch tragen, etwa wenn das
      // native Token abgelaufen oder widerrufen ist.
      console.warn(`native session was refused: ${error}`);
      return undefined;
    }
    return token;
  } catch (err) {
    console.warn('could not use the native firebase session', err);
    return undefined;
  }
}

/** Erst die native Sitzung, dann das NextAuth-Cookie. */
async function recoveryToken(
  hasSession: boolean,
): Promise<RecoveredToken | undefined> {
  const nativeToken = await tokenFromNativeSession();
  if (nativeToken) {
    return { token: nativeToken, source: 'native' };
  }
  if (!hasSession) {
    return undefined;
  }
  const { token, error } = await createFirebaseTokenForSession();
  if (!token) {
    console.warn(`session recovery was refused: ${error}`);
    return undefined;
  }
  return { token, source: 'session' };
}

/**
 * Holt den Firebase-Client zurueck, wenn seine Anmeldung weg ist.
 *
 * Die App fuehrt zwei Sitzungen nebeneinander: `isAuthorized` kommt aus dem
 * NextAuth-Cookie und schaltet die ganze Oberflaeche frei, waehrend jeder
 * Datenzugriff `hasFirebaseUser` voraussetzt. Bricht der Firebase-Login ab
 * oder geht der Browserspeicher der WebView verloren, bleibt genau der
 * Zustand `isSignedIn: N` / `isAuthorized: Y` zurueck: angemeldete App,
 * keine Daten, und kein Login-Bildschirm, weil `isAuthorized` ja stimmt.
 *
 * Ohne diesen Hook gibt es daraus keinen Rueckweg — der einzige
 * Custom-Token-Login haengt am `?token=` eines Share-Links, und
 * `serverLogin()` braucht zum Auffrischen des Cookies seinerseits einen
 * Firebase-Benutzer.
 *
 * Das NextAuth-Cookie ist dabei nur der zweite Weg. Es laeuft nach einer
 * Stunde ab und kann ohne Firebase-Benutzer nicht aufgefrischt werden; die
 * native Sitzung dagegen ueberlebt jeden App-Neustart. Deshalb zuerst nativ.
 *
 * Bewusst genau **ein** Versuch je Seitenaufbau: Schlaegt er fehl, ist der
 * Login von Hand faellig, und eine Schleife aus Server-Aufrufen waere das
 * Letzte, was ein Geraet mit schlechter Verbindung braucht.
 */
export function useFirebaseSessionRecovery() {
  const { status } = useSession();
  const attemptedRef = useRef(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // `loading` heisst nur "NextAuth weiss es noch nicht". Abwarten, sonst
    // verschenken wir den zweiten Weg, bevor er ueberhaupt bereitsteht.
    if (status === 'loading' || attemptedRef.current) return;

    let cancelled = false;

    (async () => {
      // Erst wenn Firebase seinen gespeicherten Zustand geladen hat, sagt
      // `currentUser === null` wirklich "kein Benutzer" und nicht "noch nicht
      // nachgesehen".
      await auth.authStateReady();
      if (cancelled || auth.currentUser || isSessionRecoverySuppressed()) {
        return;
      }

      attemptedRef.current = true;
      setIsRecovering(true);
      console.info(
        'no firebase user in the webview, recovering the firebase login',
      );
      try {
        const recovered = await recoveryToken(status === 'authenticated');
        if (!recovered) {
          throw new Error('no token available to recover the login');
        }
        await signInWithCustomToken(auth, recovered.token);
        console.info(`firebase login recovered from the ${recovered.source}`);

        // Wie beim Share-Link-Login: Die nativen Dienste (Live-Standort,
        // Radiacode-Tracking) schreiben mit der nativen Firebase-Sitzung,
        // nicht mit der des JS-SDK. Kam das Token von dort, steht sie schon.
        if (recovered.source !== 'native' && Capacitor.isNativePlatform()) {
          try {
            await FirebaseAuthentication.signInWithCustomToken({
              token: recovered.token,
              skipNativeAuth: false,
            });
          } catch (nativeErr) {
            console.warn(
              'native signInWithCustomToken failed (tracking may not work)',
              nativeErr,
            );
          }
        }
      } catch (err) {
        console.error('firebase session recovery failed', err);
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setIsRecovering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return { isRecovering, error };
}

/**
 * Beim Abmelden faellt der Firebase-Benutzer weg, bevor `useSession` den
 * Wegfall des Cookies meldet. Ohne diese Sperre haelt der Hook genau dieses
 * Zeitfenster fuer einen Ausfall und meldet den Benutzer wieder an — und die
 * native Sitzung ueberlebt das Abmelden in der WebView ohnehin.
 */
let recoverySuppressed = false;

export function suppressSessionRecovery() {
  recoverySuppressed = true;
}

export function isSessionRecoverySuppressed() {
  return recoverySuppressed;
}
