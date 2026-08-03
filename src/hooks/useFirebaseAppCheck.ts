import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { firebaseApp } from '../components/firebase/firebase';
import { useEffect } from 'react';

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  }
}

/**
 * Initialize Firebase App Check.
 *
 * App Check is required for Firebase AI Logic (Gemini via `firebase/ai`) —
 * Firebase enforces it for all AI Logic requests from 2026-11-02 on, and
 * enforcement cannot be turned off for AI Logic. Requests without a valid
 * App Check token are rejected.
 *
 * Production uses the reCAPTCHA Enterprise provider with the site key from
 * `NEXT_PUBLIC_RECAPTCHA_KEY`. That site key is only allowed for the deployed
 * domains, so local development uses App Check's debug provider instead:
 * setting `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` makes the SDK skip reCAPTCHA and
 * present a debug token that has to be registered once in the Firebase Console
 * (App Check → Apps → Debug tokens).
 *
 * - `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=true` → the SDK logs a freshly generated
 *   token to the browser console on every reload; register it, then pin it.
 * - `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=<uuid>` → reuse an already registered
 *   token, no console round-trip needed.
 *
 * The variable is deliberately opt-in (it is set in the gitignored `.env.local`
 * only and never in `.github/workflows/cloud-run.yml`), so a deployed build
 * cannot accidentally fall back to the debug provider.
 */
export default function useFirebaseAppCheck() {
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_KEY;
    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;

    if (!siteKey && !debugToken) {
      return;
    }

    if (debugToken) {
      // Must be set before initializeAppCheck() — the SDK reads it during init.
      window.FIREBASE_APPCHECK_DEBUG_TOKEN =
        debugToken === 'true' ? true : debugToken;
      console.warn(
        'app check debug provider enabled - do not use this in production.'
      );
    }

    const appCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey || ''),
      isTokenAutoRefreshEnabled: true, // Set to true to allow auto-refresh.
    });
    console.info('app check initialized.', appCheck);
  }, []);
}
