'use client';

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { signInWithCustomToken } from 'firebase/auth';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { createFirebaseTokenForSession } from '../app/actions/auth';
import { auth } from '../components/firebase/firebase';

/**
 * Holt den Firebase-Client zurueck, wenn nur noch die NextAuth-Session steht.
 *
 * Die App fuehrt zwei Sitzungen nebeneinander: `isAuthorized` kommt aus dem
 * NextAuth-Cookie und schaltet die ganze Oberflaeche frei, waehrend jeder
 * Datenzugriff `hasFirebaseUser` voraussetzt. Bricht der Firebase-Login ab
 * oder geht der Browserspeicher verloren, bleibt genau der Zustand
 * `isSignedIn: N` / `isAuthorized: Y` zurueck: angemeldete App, keine Daten,
 * und kein Login-Bildschirm, weil `isAuthorized` ja stimmt.
 *
 * Ohne diesen Hook gibt es daraus keinen Rueckweg — der einzige
 * Custom-Token-Login haengt am `?token=` eines Share-Links. Hier wird
 * stattdessen aus der bestehenden Session ein Token geholt und der Client
 * damit neu angemeldet.
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
    if (status !== 'authenticated' || attemptedRef.current) return;

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
        'NextAuth session without firebase user, recovering firebase login',
      );
      try {
        const { token, error: tokenError } =
          await createFirebaseTokenForSession();
        if (!token) {
          throw new Error(tokenError ?? 'no token returned');
        }
        await signInWithCustomToken(auth, token);
        console.info('firebase login recovered from session');

        // Wie beim Share-Link-Login: Die nativen Dienste (Live-Standort,
        // Radiacode-Tracking) schreiben mit der nativen Firebase-Sitzung,
        // nicht mit der des JS-SDK.
        if (Capacitor.isNativePlatform()) {
          try {
            await FirebaseAuthentication.signInWithCustomToken({
              token,
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
 * Zeitfenster fuer einen Ausfall und meldet den Benutzer wieder an.
 */
let recoverySuppressed = false;

export function suppressSessionRecovery() {
  recoverySuppressed = true;
}

export function isSessionRecoverySuppressed() {
  return recoverySuppressed;
}
