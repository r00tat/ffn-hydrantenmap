'use server';
import 'server-only';

import { writeHomeGroup, type HomeGroupResult } from '../../server/auth/homeGroup';
import { actionUserRequired } from '../auth';

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
