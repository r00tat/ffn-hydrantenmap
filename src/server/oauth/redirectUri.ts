/**
 * Prüfung der `redirect_uri` — **exakter Vergleich, keine Wildcards.**
 *
 * Nur HTTPS ist zulässig. Ausnahmen gibt es genau zwei, beide nur für Clients
 * mit `application_type: 'native'`:
 *
 * - Loopback-HTTP (`http://127.0.0.1:…`, `http://localhost:…`, `http://[::1]:…`)
 *   nach RFC 8252 Abschnitt 7.3 — Claude Code und Claude Desktop öffnen einen
 *   lokalen Listener auf einem frei gewählten Port.
 * - Private-Use-URI-Schemata (`de.example.app:/callback`) nach RFC 8252
 *   Abschnitt 7.1.
 *
 * Der Port einer Loopback-Adresse wird beim Vergleich **ignoriert**, weil der
 * Client ihn erst zur Laufzeit erfährt (RFC 8252 Abschnitt 7.3). Alles andere
 * — Schema, Host, Pfad, Query — muss exakt übereinstimmen.
 */

export type OAuthApplicationType = 'web' | 'native';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1'];

function parse(uri: string): URL | undefined {
  try {
    return new URL(uri);
  } catch {
    return undefined;
  }
}

export function isLoopbackRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url || url.protocol !== 'http:') {
    return false;
  }
  return LOOPBACK_HOSTS.includes(url.hostname);
}

/**
 * Ein Private-Use-URI-Schema nach RFC 8252: ein Schema, das weder `http` noch
 * `https` ist und mindestens einen Punkt enthält (umgekehrter Domainname).
 * Ohne die Punkt-Forderung wäre `javascript:` ein zulässiges Redirect-Ziel.
 */
export function isPrivateUseRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url) {
    return false;
  }
  const scheme = url.protocol.replace(/:$/, '');
  return (
    scheme !== 'http' && scheme !== 'https' && scheme.includes('.')
  );
}

/**
 * Darf diese `redirect_uri` überhaupt registriert werden?
 *
 * Das ist die Prüfung bei der Client-Registrierung; der Abgleich gegen die
 * registrierten URIs beim `authorize` läuft über `matchRedirectUri`.
 */
export function isAllowedRedirectUri(
  uri: string,
  applicationType: OAuthApplicationType,
): boolean {
  const url = parse(uri);
  if (!url) {
    return false;
  }
  // Ein Fragment ist in einer redirect_uri nach RFC 6749 Abschnitt 3.1.2
  // verboten — der Authorization Server hängt dort selbst nichts an, aber der
  // exakte Vergleich würde sonst von einem Fragment abhängen, das der Browser
  // gar nicht mitschickt.
  if (url.hash) {
    return false;
  }
  if (url.protocol === 'https:') {
    return true;
  }
  if (applicationType !== 'native') {
    return false;
  }
  return isLoopbackRedirectUri(uri) || isPrivateUseRedirectUri(uri);
}

/**
 * Findet die registrierte `redirect_uri`, die der angefragten entspricht.
 *
 * Liefert die **registrierte** Fassung zurück, nicht die angefragte: Bei einer
 * Loopback-Adresse unterscheiden sich die beiden im Port, und weitergeleitet
 * wird auf den vom Client angefragten Port — deshalb gibt die Funktion
 * zusätzlich `matched` mit der angefragten URI zurück.
 */
export function matchRedirectUri(
  requested: string,
  registered: readonly string[],
): string | undefined {
  if (registered.includes(requested)) {
    return requested;
  }

  // Loopback: derselbe Pfad auf einem anderen Port zählt als Treffer.
  if (!isLoopbackRedirectUri(requested)) {
    return undefined;
  }
  const requestedUrl = parse(requested);
  if (!requestedUrl) {
    return undefined;
  }
  const hit = registered.find((candidate) => {
    if (!isLoopbackRedirectUri(candidate)) {
      return false;
    }
    const candidateUrl = parse(candidate);
    if (!candidateUrl) {
      return false;
    }
    return (
      candidateUrl.hostname === requestedUrl.hostname &&
      candidateUrl.pathname === requestedUrl.pathname &&
      candidateUrl.search === requestedUrl.search
    );
  });
  return hit ? requested : undefined;
}
