/**
 * Wo der Firebase-Auth-Handler liegt.
 *
 * Standardmaessig zeigt `authDomain` auf `ffn-utils.firebaseapp.com`. Damit
 * laeuft jeder Google-Login ueber eine **fremde Origin**, und genau daran
 * scheitert er in WebKit-Browsern:
 *
 * - `signInWithPopup` gibt das Ergebnis per `postMessage` an `window.opener`
 *   zurueck. Bluefy (WKWebView) oeffnet `window.open` als eigenen Tab ohne
 *   `opener` — der Handler bleibt als weisse Seite stehen und die App bekommt
 *   die Credentials nie.
 * - `signInWithRedirect` braucht Storage auf der Handler-Domain. Die ist dort
 *   Third-Party und wird von WebKit blockiert.
 *
 * Der Ausweg ist der von Firebase dokumentierte: `/__/auth/*` unter der
 * **eigenen** Domain ausliefern (Rewrite in `next.config.js`) und `authDomain`
 * auf ebendiese Domain zeigen lassen. Dann ist der ganze Ablauf same-origin —
 * ohne Popup, ohne Third-Party-Storage.
 *
 * Der Umbau betrifft den Login **aller** Benutzer, deshalb ist er hier
 * dreistufig schaltbar (das jeweils Naehere gewinnt):
 *
 * 1. `NEXT_PUBLIC_FIREBASE_AUTH_PROXY=true` als Voreinstellung je Umgebung,
 * 2. `?authProxy=1` bzw. `?authProxy=0` in der URL — schaltet fuer dieses
 *    Geraet um und merkt sich die Wahl,
 * 3. der gemerkte Wert im `localStorage`.
 *
 * Ob dann Popup oder Redirect gewaehlt wird, entscheidet signInStrategy.ts —
 * das ist eine eigene Frage und hat mit `?signInFlow=` einen eigenen Schalter.
 *
 * Damit laesst sich der neue Weg auf einem einzelnen Geraet ausprobieren,
 * ohne fuer alle anderen etwas zu aendern.
 *
 * **Nur unter https.** Siehe `resolveAuthDomain`.
 *
 * **Jede Origin, die den Handler ausliefert, muss beim OAuth-Client in der
 * Google Cloud Console als Redirect-URI eingetragen sein**
 * (`https://<origin>/__/auth/handler`). Fehlt sie, antwortet Google mit
 * `redirect_uri_mismatch`. Siehe docs/auth-und-origins.md.
 */

export const AUTH_PROXY_STORAGE_KEY = 'firebaseAuthProxy';
export const AUTH_PROXY_QUERY_PARAM = 'authProxy';

/**
 * Nur die Teile von `window`, die hier gebraucht werden — so ist die
 * Entscheidung ohne DOM testbar.
 */
export interface AuthProxyWindow {
  location: { search: string; host: string; protocol: string };
  localStorage: Pick<Storage, 'getItem' | 'setItem'>;
}

export function currentWindow(): AuthProxyWindow | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as unknown as AuthProxyWindow);
}

function parseFlag(value: string | undefined): boolean | undefined {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
}

/**
 * Ein geraetelokaler Schalter: steht er in der URL, gilt er und wird gemerkt;
 * sonst zaehlt der gemerkte Wert. `undefined` heisst „nichts gewaehlt" — dann
 * entscheidet der Aufrufer.
 *
 * `localStorage` wirft im privaten Modus und wenn Website-Daten gesperrt sind.
 * Ein Fehler beim Lesen oder Merken darf den Login nicht mitnehmen.
 */
export function readDeviceSwitch(
  win: AuthProxyWindow,
  queryParam: string,
  storageKey: string,
): string | undefined {
  const fromQuery = new URLSearchParams(win.location.search).get(queryParam);
  if (fromQuery !== null) {
    try {
      win.localStorage.setItem(storageKey, fromQuery);
    } catch {
      // Dann gilt die Wahl eben nur fuer diesen Seitenaufruf.
    }
    return fromQuery;
  }

  try {
    return win.localStorage.getItem(storageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

export function isAuthProxyEnabled(
  win: AuthProxyWindow | undefined = currentWindow(),
): boolean {
  if (!win) return false;

  const chosen = parseFlag(
    readDeviceSwitch(win, AUTH_PROXY_QUERY_PARAM, AUTH_PROXY_STORAGE_KEY),
  );
  if (chosen !== undefined) return chosen;

  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY === 'true';
}

/**
 * Die `authDomain` fuer `initializeApp`: bei aktivem Proxy der eigene Host,
 * sonst der konfigurierte Wert aus `NEXT_PUBLIC_FIREBASE_APIKEY`.
 */
export function resolveAuthDomain(
  configured: string | undefined,
  win: AuthProxyWindow | undefined = currentWindow(),
): string | undefined {
  if (!win || !isAuthProxyEnabled(win)) return configured;

  // Das Firebase-SDK baut die Handler-URL immer als `https://<authDomain>/…`
  // — das Schema der Seite spielt dabei keine Rolle. Auf einer http-Origin
  // zeigte der Proxy damit auf einen Port, an dem kein TLS lauscht: Das
  // versteckte `/__/auth/iframe` scheitert, und der Login bleibt haengen,
  // ohne dass ein Fehler in der Oberflaeche ankommt. `npm run dev` laeuft
  // ueber http — dort braucht es `npm run dev:https`.
  if (win.location.protocol !== 'https:') {
    console.warn(
      '[authDomain] Proxy uebersprungen: Der erst-party Auth-Handler braucht' +
        ' eine https-Origin (npm run dev:https).',
    );
    return configured;
  }

  return win.location.host;
}
