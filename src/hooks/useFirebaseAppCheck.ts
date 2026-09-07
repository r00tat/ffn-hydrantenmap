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
 * Whether App Check was already set up for `firebaseApp`.
 *
 * React invokes effects twice in StrictMode and again on every fast refresh,
 * and `initializeAppCheck` rejects a second call for the same app. Module
 * scope is the right lifetime for this: it matches the Firebase app instance,
 * which is also created once per module graph.
 */
let appCheckInitialized = false;

/**
 * Initialize Firebase App Check.
 *
 * App Check is what stands between the public browser API key and the billable
 * Gemini calls of Firebase AI Logic (`firebase/ai`). The key itself is shipped
 * in the JS bundle and its HTTP-referrer restriction is trivially spoofed, so
 * enforcement on `firebasevertexai.googleapis.com` is the only real gate — see
 * docs/api-keys.md. Firebase additionally enforces App Check for all AI Logic
 * requests from 2026-11-02 on, with no opt-out.
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
    if (appCheckInitialized) {
      return;
    }

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

    // Failures are contained on purpose. `AppProviders` wraps every page, so an
    // exception escaping here would blank the screen during an operation. What
    // breaks instead is narrow and visible: Gemini calls get rejected once
    // enforcement is on, while Firestore rules and the server-side auth guards
    // keep gating everything else.
    try {
      initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(siteKey || ''),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckInitialized = true;
      console.info('app check initialized.');
    } catch (err) {
      console.warn('app check initialization failed', err);
    }
  }, []);
}
