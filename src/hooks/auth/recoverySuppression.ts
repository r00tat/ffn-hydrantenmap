const SUPPRESSION_KEY = 'ffnd.sessionRecoverySuppressed';

/**
 * Das Modul-Flag deckt das Zeitfenster **vor** dem Reload ab: Beim Abmelden
 * faellt der Firebase-Benutzer weg, bevor `useSession` den Wegfall des Cookies
 * meldet, und ohne Sperre haelt `useFirebaseSessionRecovery` genau das fuer
 * einen Ausfall.
 */
let recoverySuppressed = false;

/**
 * `localStorage` deckt alles danach ab. `fbSignOut` schliesst mit
 * `window.location.assign('/login')` ab, und ein harter Reload wirft das Modul
 * samt Flag weg — im logcat des Geraets vom 2026-09-22 laeuft der Hook 640 ms
 * nach `logout completed` prompt wieder an. Dort blieb es folgenlos, weil
 * weder native Sitzung noch Cookie uebrig waren; mit einer nativen Sitzung
 * holte die Bruecke den gerade Abgemeldeten daraus zurueck.
 *
 * Bewusst `localStorage` und nicht `sessionStorage`: scheitert der native
 * `signOut`, ueberlebt die Firebase-Sitzung im nativen SDK auch den
 * App-Neustart, und die Sperre muss so weit reichen wie das, wogegen sie
 * schuetzt. Aufgehoben wird sie bei der naechsten erfolgreichen Anmeldung
 * (`useFirebaseLoginObserver`), nicht durch Zeitablauf.
 *
 * Eigenes Modul, weil auch `LoginUi` die Sperre liest: dort haengt daran, ob
 * die Seite eine automatische Anmeldung ankuendigt. Ueber den Hook importiert
 * wuerde die Login-Seite Firebase, Capacitor und NextAuth mitziehen.
 *
 * Jeder Zugriff ist gekapselt: im privaten Modus und bei geloeschten
 * Site-Daten wirft schon das Lesen. Dann traegt nur das Modul-Flag — das ist
 * der Stand vor dieser Sperre und kein Grund, die Wiederherstellung
 * abzubrechen.
 */
function storedSuppression(): boolean {
  try {
    return window.localStorage.getItem(SUPPRESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function suppressSessionRecovery() {
  recoverySuppressed = true;
  try {
    window.localStorage.setItem(SUPPRESSION_KEY, '1');
  } catch {
    // s.o. — das Modul-Flag bleibt.
  }
}

export function clearSessionRecoverySuppression() {
  recoverySuppressed = false;
  try {
    window.localStorage.removeItem(SUPPRESSION_KEY);
  } catch {
    // s.o.
  }
}

export function isSessionRecoverySuppressed() {
  return recoverySuppressed || storedSuppression();
}
