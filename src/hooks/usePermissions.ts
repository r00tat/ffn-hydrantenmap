'use client';

import {
  can,
  canAny,
  type Permission,
} from '../common/permissions';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Rechte-Prüfung für die Oberfläche, auf Basis der Sitzung bzw. des
 * Offline-Zwischenspeichers. Öffnet nur die Oberfläche — die Entscheidung
 * treffen Server Actions und Firestore-Regeln selbst.
 */

/**
 * Hat der Benutzer das Recht in dieser Gruppe? Ohne Gruppe (etwa solange der
 * Einsatz noch lädt) falsch.
 */
export function useCan(groupId: string | undefined, perm: Permission): boolean {
  const { isAuthorized, isAdmin, groupRoles } = useFirebaseLogin();
  if (!isAuthorized || !groupId) return false;
  return can({ isAdmin, groupRoles }, groupId, perm);
}

/** Hat der Benutzer das Recht in irgendeiner Gruppe? Für Menü und Seitenschutz. */
export function useCanAny(perm: Permission): boolean {
  const { isAuthorized, isAdmin, groupRoles } = useFirebaseLogin();
  if (!isAuthorized) return false;
  return canAny({ isAdmin, groupRoles }, perm);
}
