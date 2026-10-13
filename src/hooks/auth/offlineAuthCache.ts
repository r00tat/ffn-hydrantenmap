import type { Group } from '../../app/groups/groupTypes';
import {
  legacyToGroupRoles,
  type GroupRoles,
  type LegacyRoleFields,
} from '../../common/permissions';

/**
 * Zwischenspeicher der zuletzt am Server bestätigten Anmeldung für den
 * Kaltstart ohne Netz (Issue #839, Phase 5).
 *
 * Die Rechte der Oberfläche (`isAuthorized`, `groups`, `groupRoles`, …) stehen
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
  /** Rollen je Gruppe, siehe `src/common/permissions.ts`. */
  groupRoles: GroupRoles;
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

function isGroupRoles(value: unknown): value is GroupRoles {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(isStringArray)
  );
}

/** Ein gespeicherter Eintrag, gegebenenfalls noch im Format vor `groupRoles`. */
type StoredSnapshot = Omit<OfflineAuthSnapshot, 'groupRoles'> &
  LegacyRoleFields & { groupRoles?: unknown };

function isSnapshot(value: unknown): value is StoredSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StoredSnapshot>;
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
  const snapshot = upgradeSnapshot(parsed);

  const age = now - snapshot.savedAt;
  const expired =
    age > OFFLINE_AUTH_MAX_AGE_MS ||
    age < -CLOCK_SKEW_MS ||
    (typeof snapshot.expiresAt === 'number' && now > snapshot.expiresAt);
  if (expired) {
    clearOfflineAuth();
    return null;
  }
  if (!snapshot.isAuthorized) return null;
  if (uid !== undefined && snapshot.uid !== uid) return null;
  return snapshot;
}

/**
 * Einträge aus der Zeit vor `groupRoles` rechnet der Leser einmalig um — rein
 * lokal, kein paralleles Schreiben. Sonst stünden Geräte, die seit dem Release
 * nicht online waren, beim Kaltstart ohne Netz ohne Gruppen da.
 */
function upgradeSnapshot(stored: StoredSnapshot): OfflineAuthSnapshot {
  const {
    groupAdmin,
    fahrtenbuchGeraetemeister,
    bekleidungswart,
    groupRoles,
    ...rest
  } = stored;
  return {
    ...rest,
    groupRoles: isGroupRoles(groupRoles)
      ? groupRoles
      : legacyToGroupRoles({
          groups: stored.groups,
          groupAdmin,
          fahrtenbuchGeraetemeister,
          bekleidungswart,
        }),
  };
}
