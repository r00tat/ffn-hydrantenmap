import { AuthProxyWindow, isAuthProxyEnabled } from './authDomain';

/**
 * Popup oder Redirect?
 *
 * `signInWithPopup` ist der angenehmere Weg — die Seite bleibt stehen — und
 * bleibt deshalb ueberall dort, wo er funktioniert. Auf iOS funktioniert er
 * nicht zuverlaessig: Der Handler gibt sein Ergebnis per `postMessage` an
 * `window.opener`, und WebKit-Browser jenseits von Safari (Bluefy und andere
 * WKWebView-Browser) oeffnen `window.open` als eigenstaendigen Tab ohne diese
 * Beziehung. Der Login bleibt dann auf einer weissen Handler-Seite stehen,
 * ohne Fehler und ohne Rueckweg.
 *
 * `signInWithRedirect` waere dort der Ausweg, taugt aber nur mit einem
 * erst-party Auth-Handler: Auf einer fremden Handler-Domain braucht er
 * Third-Party-Storage, die WebKit blockiert. Deshalb haengt der Redirect am
 * Proxy-Schalter aus authDomain.ts — ohne ihn waere er schlechter als das
 * Popup, nicht besser.
 */

/** Nur die Teile von `navigator`, die hier gebraucht werden. */
export interface SignInNavigator {
  userAgent: string;
  maxTouchPoints: number;
}

function currentNavigator(): SignInNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}

export function isIosWebKit(
  nav: SignInNavigator | undefined = currentNavigator(),
): boolean {
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  // Ein iPad meldet sich seit iPadOS 13 als "Macintosh". Vom echten Mac
  // unterscheidet es nur, dass es mehrere Beruehrpunkte kennt.
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
}

export function shouldUseRedirectSignIn(
  nav: SignInNavigator | undefined = currentNavigator(),
  win?: AuthProxyWindow,
): boolean {
  if (!nav) return false;
  if (!isAuthProxyEnabled(win)) return false;
  return isIosWebKit(nav);
}
