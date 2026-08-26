/**
 * Prüfung der `redirect_uri` — **exakter Vergleich, keine Wildcards.**
 *
 * Zulässig sind HTTPS und zwei Ausnahmen aus RFC 8252:
 *
 * - Loopback-HTTP (`http://127.0.0.1:…`, `http://localhost:…`, `http://[::1]:…`)
 *   nach Abschnitt 7.3 — Claude Code und Claude Desktop öffnen einen lokalen
 *   Listener auf einem frei gewählten Port.
 * - Private-Use-URI-Schemata (`de.example.app:/callback`) nach Abschnitt 7.1.
 *
 * Der Port einer Loopback-Adresse wird beim Vergleich **ignoriert**, weil der
 * Client ihn erst zur Laufzeit erfährt (RFC 8252 Abschnitt 7.3). Alles andere
 * — Schema, Host, Pfad, Query — muss exakt übereinstimmen.
 *
 * ## Warum `application_type` hier nichts entscheidet
 *
 * Die beiden Ausnahmen hingen zunächst an `application_type: 'native'`. Das
 * war doppelt falsch. Praktisch: Claude Code deklariert in seinem
 * Metadaten-Dokument gar kein `application_type` — RFC 7591 kennt keine
 * Pflicht dazu — und registriert `http://localhost/callback`. Der Vorgabewert
 * `web` hat den Client damit ausgesperrt.
 *
 * Grundsätzlich wog schwerer: `application_type` ist eine **Selbstauskunft des
 * Clients**. Wer Loopback missbrauchen will, schreibt `native` hinein. Die
 * Schranke hielt also niemanden auf, den sie aufhalten sollte, und sperrte
 * nur die aus, die ehrlich waren.
 *
 * Was Loopback tatsächlich absichert, ist PKCE: Ein Code, den ein anderer
 * lokaler Prozess abfängt, ist ohne den `code_verifier` wertlos, und dieser
 * Server verlangt PKCE mit S256 ausnahmslos.
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
export function isAllowedRedirectUri(uri: string): boolean {
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
