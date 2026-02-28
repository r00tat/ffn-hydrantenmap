'use server';
import 'server-only';

import { firebaseAuth } from '../../server/firebase/admin';

export async function sendPasswordReset(email: string) {
  if (!email || !email.includes('@')) {
    return { error: 'Bitte geben Sie eine gültige Email Adresse ein.' };
  }

  try {
    // Verify the user exists before generating the link
    await firebaseAuth.getUserByEmail(email);
    // Generate the password reset link – Firebase Admin sends the email
    // via the configured email template when using the REST API under the hood.
    // We use generatePasswordResetLink to create the link, then rely on
    // the Firebase Auth REST API to actually deliver the email.
    const apiKey = JSON.parse(
      process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
    ).apiKey;

    if (!apiKey) {
      console.error('Firebase API key not found');
      return { error: 'Server-Konfigurationsfehler.' };
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email,
        }),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      const errorMessage = data?.error?.message;
      if (errorMessage === 'EMAIL_NOT_FOUND') {
        return {
          error:
            'Es wurde kein Benutzer mit dieser Email Adresse gefunden.',
        };
      }
      console.error('Password reset API error:', errorMessage);
      return { error: 'Fehler beim Zurücksetzen des Passworts.' };
    }

    return {
      info: 'Eine Email zum Zurücksetzen des Passworts wurde versandt. Bitte prüfen Sie Ihre Email.',
    };
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      return {
        error: 'Es wurde kein Benutzer mit dieser Email Adresse gefunden.',
      };
    }
    console.error('password reset failed', err);
    return { error: 'Fehler beim Zurücksetzen des Passworts.' };
  }
}
