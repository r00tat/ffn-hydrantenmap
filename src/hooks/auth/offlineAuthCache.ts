import type { Group } from '../../app/groups/groupTypes';

/**
 * Zwischenspeicher der zuletzt am Server bestätigten Anmeldung für den
 * Kaltstart ohne Netz (Issue #839, Phase 5).
 *
 * Die Rechte der Oberfläche (`isAuthorized`, `groups`, `groupAdmin`, …) stehen
 * in der NextAuth-Sitzung und kommen aus `getMyGroupsFromServer` — beides
 * braucht den Server. Ohne Netz zeigte die App deshalb nach einem Neustart den
 * Login-Bildschirm, obwohl Firebase Auth den Benutzer aus IndexedDB kennt und
 * Firestore die Daten im Cache hat.
 *
 * Grenzen, die bewusst gezogen sind (Begründung: docs/berechtigungen.md):
 *
 * - **localStorage, nicht sessionStorage:** Der Kaltstart ist genau der Fall,
 *   in dem die Sitzung des Browsers weg ist.
 * - **An die Firebase-UID gebunden:** Meldet sich am selben Gerät jemand
 *   anderer an, erbt er nichts.
 * - **90 Tage ab der letzten Bestätigung am Server.** Viele starten die App
 *   nur im Einsatz; eine kurze Frist ließe genau sie beim Kaltstart ohne Netz
 *   vor dem Login-Bildschirm stehen. Gelesen wird der Eintrag nur offline;
 *   online wird er nur erneuert. Ein Zeitstempel aus der
 *   Zukunft gilt als ungültig, damit eine verstellte Uhr die Frist nicht
 *   verlängert.
 * - **Beim Abmelden gelöscht.**
 *
 * Der Speicher öffnet nur die Oberfläche. Rechte setzen die Firestore-Regeln
 * beim Synchronisieren ohnehin durch.
 */

export const OFFLINE_AUTH_STORAGE_KEY = 'fbAuthOffline';
export const OFFLINE_AUTH_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** Spielraum für Uhren, die zwischen zwei Aufrufen leicht nachgestellt wurden. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface OfflineAuthData {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  isAuthorized: boolean;
  isAdmin: boolean;
  groups: string[];
  groupAdmin?: string[];
  fahrtenbuchGeraetemeister?: string[];
  bekleidungswart?: string[];
  firecall?: string;
  firecallWrite?: boolean;
  /**
   * Ablauf (ms) eines Einsatz-Gastzugangs (`firecallExpiresAt` der Sitzung).
   * Der Zwischenspeicher verlängert einen Gastzugang nicht über sein Ende.
   */
  expiresAt?: number;
  myGroups: Group[];
}

export interface OfflineAuthSnapshot extends OfflineAuthData {
  /** Zeitpunkt (ms) der letzten Bestätigung am Server. */
  savedAt: number;
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isSnapshot(value: unknown): value is OfflineAuthSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<OfflineAuthSnapshot>;
  return (
    typeof v.uid === 'string' &&
    v.uid.length > 0 &&
    typeof v.savedAt === 'number' &&
    typeof v.isAuthorized === 'boolean' &&
    typeof v.isAdmin === 'boolean' &&
    isStringArray(v.groups) &&
    Array.isArray(v.myGroups)
  );
}

export function clearOfflineAuth(): void {
  try {
    storage()?.removeItem(OFFLINE_AUTH_STORAGE_KEY);
  } catch {
    // Ohne Speicher gibt es auch nichts zu löschen.
  }
}

/**
 * Speichert die Anmeldung. Nur aufrufen, wenn der Server sie gerade bestätigt
 * hat — sonst verlängerte sich die Frist offline von selbst.
 *
 * Eine nicht freigegebene Anmeldung wird nicht gespeichert, sondern löscht den
 * vorhandenen Eintrag: Entzieht ein Admin die Freigabe, soll der nächste
 * Kaltstart ohne Netz sie nicht wieder herstellen.
 */
export function saveOfflineAuth(data: OfflineAuthData, now = Date.now()): void {
  if (!data.uid || !data.isAuthorized) {
    clearOfflineAuth();
    return;
  }
  const snapshot: OfflineAuthSnapshot = { ...data, savedAt: now };
  try {
    storage()?.setItem(OFFLINE_AUTH_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('could not store the offline auth cache', err);
  }
}

/**
 * Liest die gespeicherte Anmeldung.
 *
 * Mit `uid` nur, wenn sie zu diesem Benutzer gehört. Ohne `uid` (Firebase Auth
 * hat ihren Benutzer noch nicht geladen) für eine vorläufige Anzeige — der
 * Aufrufer muss dann prüfen, ob der Benutzer danach derselbe ist.
 */
export function loadOfflineAuth(
  uid?: string,
  now = Date.now(),
): OfflineAuthSnapshot | null {
  let text: string | null = null;
  try {
    text = storage()?.getItem(OFFLINE_AUTH_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    clearOfflineAuth();
    return null;
  }
  if (!isSnapshot(parsed)) {
    clearOfflineAuth();
    return null;
  }

  const age = now - parsed.savedAt;
  const expired =
    age > OFFLINE_AUTH_MAX_AGE_MS ||
    age < -CLOCK_SKEW_MS ||
    (typeof parsed.expiresAt === 'number' && now > parsed.expiresAt);
  if (expired) {
    clearOfflineAuth();
    return null;
  }
  if (!parsed.isAuthorized) return null;
  if (uid !== undefined && parsed.uid !== uid) return null;
  return parsed;
}
