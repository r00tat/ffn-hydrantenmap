/**
 * Was der Browser ueber eine laufende Anmeldung weiss.
 *
 * Der Redirect-Weg laesst sich nicht im Labor nachstellen — dazu braucht es
 * ein echtes Google-Konto. Bleibt die Anmeldung nach der Rueckkehr aus, ist
 * die entscheidende Frage, wie weit sie gekommen ist, und die beantworten die
 * Schluessel, die Firebase in den Browserspeicher legt:
 *
 * - `pendingRedirect` steht noch da → der Handler hat kein Ergebnis
 *   hinterlegt; der Bruch liegt vor der Rueckkehr.
 * - `pendingRedirect` ist weg, aber kein `authUser` → das Ergebnis wurde
 *   eingeloest und dabei verworfen.
 * - `authUser` ist da, die App zeigt trotzdem abgemeldet → Firebase ist
 *   angemeldet, es haengt danach (Server-Login, Berechtigungen).
 */

export interface AuthStorageKeys {
  /** Ein angefangener Redirect, dessen Ergebnis noch aussteht. */
  pendingRedirect: string[];
  /** Eine bestehende Firebase-Anmeldung. */
  authUser: string[];
  /** Zustand, den die Handler-Seite fuer den Rueckweg ablegt. */
  handoff: string[];
  /** FirebaseUIs eigener Merkposten. */
  firebaseui: string[];
}

export function classifyAuthStorage(keys: string[]): AuthStorageKeys {
  return {
    pendingRedirect: keys.filter((k) =>
      k.startsWith('firebase:pendingRedirect:'),
    ),
    authUser: keys.filter((k) => k.startsWith('firebase:authUser:')),
    handoff: keys.filter(
      (k) => k.includes('oauthHelperState') || k.includes('redirectEvent'),
    ),
    firebaseui: keys.filter((k) => k.startsWith('firebaseui::')),
  };
}

/** Liest die Schluessel eines Speichers; ein gesperrter Speicher wirft. */
export function storageKeys(storage: Storage | undefined): string[] {
  if (!storage) return [];
  try {
    return Object.keys(storage);
  } catch {
    return [];
  }
}

export interface AuthDiagnostics extends AuthStorageKeys {
  phase: string;
  href: string;
  authDomain?: string;
  signInFlow: 'popup' | 'redirect';
  currentUser: string | null;
}

export function collectAuthDiagnostics(params: {
  phase: string;
  signInFlow: 'popup' | 'redirect';
  authDomain?: string;
  currentUser: string | null;
  href: string;
  sessionKeys: string[];
  localKeys: string[];
}): AuthDiagnostics {
  const { phase, signInFlow, authDomain, currentUser, href } = params;
  return {
    phase,
    href,
    authDomain,
    signInFlow,
    currentUser,
    ...classifyAuthStorage([...params.sessionKeys, ...params.localKeys]),
  };
}
