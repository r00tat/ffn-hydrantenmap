'use server';
import 'server-only';

import { isTenantGroupId } from '../../common/tenantGroups';
import {
  assignHomeGroupToMembers,
  writeHomeGroup,
  type HomeGroupResult,
} from '../../server/auth/homeGroup';
import { actionPermissionRequired, actionUserRequired } from '../auth';

/**
 * Die eigene Heimatgruppe setzen oder mit `null` entfernen. Nur eine Gruppe,
 * in der der Benutzer Mitglied ist — die Prüfung liest das Benutzerdokument,
 * nicht die Sitzung, damit eine eben entzogene Mitgliedschaft nicht zählt.
 *
 * Der Client übernimmt die Änderung über den Listener auf das eigene
 * Benutzerdokument; ein neues Token braucht es nicht.
 */
export async function setMyHomeGroup(groupId: string | null): Promise<HomeGroupResult> {
  const session = await actionUserRequired();
  const uid = session.user?.id;
  if (!uid) return { error: 'notFound' };
  return writeHomeGroup(uid, groupId ?? null);
}

export type AssignHomeGroupResult =
  | { success: true; updated: number }
  | { success: false; error: 'notTenant' };

/**
 * Die Gruppe für alle ihre Mitglieder als Heimatgruppe setzen. Verlangt
 * `gruppe.manage` — es ist eine Einstellung der Gruppe für ihre Mitglieder,
 * keine Rollenvergabe.
 */
export async function setHomeGroupForAllMembers(
  groupId: string,
): Promise<AssignHomeGroupResult> {
  await actionPermissionRequired(groupId, 'gruppe.manage');
  if (!isTenantGroupId(groupId)) return { success: false, error: 'notTenant' };
  const { updated } = await assignHomeGroupToMembers(groupId);
  return { success: true, updated };
}
