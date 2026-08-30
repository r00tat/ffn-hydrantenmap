import {
  AuthProxyWindow,
  currentWindow,
  isAuthProxyEnabled,
  readDeviceSwitch,
} from './authDomain';

/**
 * Popup oder Redirect?
 *
 * **Bei aktivem erst-party Handler immer Redirect — auf jedem Geraet.**
 *
 * Anfangs stand hier eine Geraeteerkennung: Redirect nur auf iOS, sonst das
 * angenehmere Popup. Sie hat sich als der falsche Ansatz erwiesen. iPadOS
 * meldet sich seit Version 13 als „Macintosh" und ist nur an den
 * Beruehrpunkten vom echten Mac zu unterscheiden; WKWebView-Browser wie
 * Bluefy bringen eigene Kennungen mit, und mit jedem iOS-Update kann sich das
 * wieder aendern. Greift die Erkennung nicht, faellt der Login lautlos auf
 * genau den Popup-Weg zurueck, der in WebKit kaputt ist — ohne Fehler, ohne
 * Hinweis. Eine Weiche, deren Fehlerfall der Fehler selbst ist, ist keine
 * gute Weiche.
 *
 * Mit erst-party Handler ist der Redirect ueberall unterstuetzt, und auf der
 * Anmeldeseite kostet der Seitenneuaufbau nichts — es gibt kein Formular, das
 * dabei verloren geht. Ein Weg statt zwei, und der ohne stillen Fehlerfall.
 *
 * Zur Erinnerung, warum das Popup in WebKit scheitert: Der Handler gibt sein
 * Ergebnis per `postMessage` an `window.opener` zurueck, und WKWebView-Browser
 * oeffnen `window.open` als eigenstaendigen Tab ohne diese Beziehung. Der
 * Login bleibt dann auf einer weissen Handler-Seite stehen.
 */

export const SIGN_IN_FLOW_STORAGE_KEY = 'firebaseSignInFlow';
export const SIGN_IN_FLOW_QUERY_PARAM = 'signInFlow';

export function shouldUseRedirectSignIn(
  win: AuthProxyWindow | undefined = currentWindow(),
): boolean {
  if (!win) return false;

  // Der Redirect steht und faellt mit dem erst-party Handler — auch ein von
  // Hand erzwungener. Ohne ihn braeuchte er Third-Party-Storage, die WebKit
  // blockiert, und waere schlechter als das Popup, nicht besser.
  if (!isAuthProxyEnabled(win)) return false;

  // Notausstieg: `?signInFlow=popup` dreht auf den alten Weg zurueck, falls
  // sich der Redirect irgendwo doch als untauglich erweist.
  // `?signInFlow=redirect` nimmt das wieder zurueck.
  return (
    readDeviceSwitch(win, SIGN_IN_FLOW_QUERY_PARAM, SIGN_IN_FLOW_STORAGE_KEY) !==
    'popup'
  );
}
