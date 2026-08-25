import { createHash } from 'crypto';

/**
 * PKCE nach RFC 7636. Nur `S256` — `plain` und ein fehlendes `code_challenge`
 * werden schon am `authorize`-Endpunkt abgewiesen, nicht erst hier.
 */
export const PKCE_METHODS_SUPPORTED = ['S256'] as const;

/** base64url ohne Padding, wie RFC 7636 es für die Challenge verlangt. */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** Die `S256`-Challenge zu einem Verifier. */
export function deriveCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
}

/**
 * Ein `code_verifier` nach RFC 7636 Abschnitt 4.1: 43–128 Zeichen aus
 * `[A-Za-z0-9-._~]`. Ohne diese Prüfung könnte ein Client mit einem trivialen
 * Verifier („a") registrieren und den Schutz aushebeln.
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier);
}

/**
 * Prüft `code_verifier` gegen die gespeicherte Challenge.
 *
 * Der Vergleich läuft über einen erneuten SHA-256 auf beiden Seiten, damit
 * beide Operanden gleich lang sind — sonst wäre schon die Längendifferenz ein
 * Seitenkanal.
 */
export function verifyCodeChallenge(
  codeVerifier: string | undefined,
  storedChallenge: string,
  method = 'S256',
): boolean {
  if (method !== 'S256') {
    return false;
  }
  if (!codeVerifier || !isValidCodeVerifier(codeVerifier)) {
    return false;
  }
  const derived = deriveCodeChallenge(codeVerifier);
  return timingSafeEqualString(derived, storedChallenge);
}

/** Zeitkonstanter Vergleich zweier Zeichenketten beliebiger Länge. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  let diff = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    diff |= hashA[i] ^ hashB[i];
  }
  return diff === 0;
}
