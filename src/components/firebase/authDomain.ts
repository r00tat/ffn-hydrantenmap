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
 * Damit laesst sich der neue Weg auf einem einzelnen Geraet ausprobieren,
 * ohne fuer alle anderen etwas zu aendern.
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
  location: { search: string; host: string };
  localStorage: Pick<Storage, 'getItem' | 'setItem'>;
}

function currentWindow(): AuthProxyWindow | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as unknown as AuthProxyWindow);
}

function parseFlag(value: string | null): boolean | undefined {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
}

/**
 * `localStorage` wirft im privaten Modus und wenn Website-Daten gesperrt sind.
 * Ein Fehler beim Merken darf den Login nicht mitnehmen.
 */
function readStored(win: AuthProxyWindow): boolean | undefined {
  try {
    return parseFlag(win.localStorage.getItem(AUTH_PROXY_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

function writeStored(win: AuthProxyWindow, enabled: boolean): void {
  try {
    win.localStorage.setItem(AUTH_PROXY_STORAGE_KEY, String(enabled));
  } catch {
    // Dann gilt die Wahl eben nur fuer diesen Seitenaufruf.
  }
}

export function isAuthProxyEnabled(
  win: AuthProxyWindow | undefined = currentWindow(),
): boolean {
  if (!win) return false;

  const fromQuery = parseFlag(
    new URLSearchParams(win.location.search).get(AUTH_PROXY_QUERY_PARAM),
  );
  if (fromQuery !== undefined) {
    writeStored(win, fromQuery);
    return fromQuery;
  }

  const stored = readStored(win);
  if (stored !== undefined) return stored;

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
  if (win && isAuthProxyEnabled(win)) return win.location.host;
  return configured;
}
