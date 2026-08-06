import 'server-only';

import { randomBytes } from 'crypto';

/**
 * 24 Zufallsbytes (192 Bit) als base64url — 32 Zeichen, die ohne Kodierung in
 * eine URL und in einen QR-Code passen. Der Token ist das gesamte Geheimnis
 * des Links, deshalb `randomBytes` und nicht `Math.random`.
 */
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Kennung eines Links für die Zuordnung erfasster Einträge. Bewusst kurz und
 * **nicht geheim**: Sie landet in `createdBy` der über den Link erfassten
 * Fahrten, und Fahrten sind für jedes Gruppenmitglied lesbar. Der Token darf
 * dort nicht stehen.
 */
export function generateShareLinkId(): string {
  return randomBytes(6).toString('hex');
}
