import { createHash, randomBytes } from 'crypto';

/**
 * Erzeugung und Ablage der opaken Geheimnisse: Authorization Codes, Refresh
 * Tokens und Client-Secrets.
 *
 * **Gespeichert wird ausschließlich der Hash.** Ein Firestore-Export, ein
 * Backup oder ein Blick in die Konsole darf niemanden in die Lage versetzen,
 * ein Token zu benutzen. SHA-256 ohne Salt und ohne Key-Stretching genügt
 * hier, anders als bei Passwörtern: Die Werte sind 256 Bit Zufall, ein
 * Wörterbuchangriff hat daran nichts zu suchen.
 */

/** 32 Byte Zufall als base64url — 256 Bit Entropie. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Kürzerer Bezeichner für Dokument-IDs, die kein Geheimnis sind. */
export function generateId(prefix: string): string {
  return `${prefix}${randomBytes(16).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Zeitkonstanter Vergleich zweier Hashes. Beide Seiten werden noch einmal
 * gehasht, damit die Operanden unabhängig von der Eingabelänge gleich lang
 * sind — sonst wäre schon die Länge ein Seitenkanal.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  let diff = 0;
  for (let i = 0; i < bufA.length; i += 1) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Ein Schlüssel für Dokument-IDs aus einer `client_id`.
 *
 * CIMD-`client_id`s sind URLs und enthalten Schrägstriche — als Firestore-
 * Dokument-ID unbrauchbar. Der Hash ist stabil und kollisionsfrei genug.
 */
export function clientDocumentKey(clientId: string): string {
  return hashToken(clientId).slice(0, 32);
}
