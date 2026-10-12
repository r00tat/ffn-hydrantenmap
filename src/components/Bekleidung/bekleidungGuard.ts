import 'server-only';

import { ApiException } from '../../app/api/errors';
import { actionUserRequired } from '../../app/auth';
import { assertTenantGroup } from '../../app/groups/groupTypes';
import { isBekleidungswart } from '../../common/bekleidungPermissions';

/**
 * Stellt sicher, dass der Benutzer die Bekleidung dieser Gruppe verwalten
 * darf — Admin, oder Gruppen-Admin bzw. Bekleidungswart jeweils mit
 * Mitgliedschaft — und dass die Gruppe ein Mandant ist.
 *
 * Wird nicht aus `app/auth.ts` weitergereicht: Dieses Modul importiert
 * `actionUserRequired` von dort, ein Re-Export ergäbe einen Import-Zyklus.
 */
export async function actionBekleidungswartRequired(groupId: string) {
  const session = await actionUserRequired();
  assertTenantGroup(groupId);
  if (!isBekleidungswart(groupId, session.user)) {
    throw new ApiException(
      `user may not manage Bekleidung of group ${groupId}`,
      { status: 403 },
    );
  }
  return session;
}
