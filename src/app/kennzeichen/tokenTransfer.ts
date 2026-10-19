import type { GroupRoles } from '../../common/permissions';

export interface TokenTransferUser {
  uid: string;
  groupRoles: GroupRoles;
}

export interface TokenTransferPlan {
  /** Mitglieder der Zielgruppe, die dort die Rolle bekommen. */
  grant: string[];
  /** Haben die Rolle in der Zielgruppe schon. */
  alreadyGranted: string[];
  /**
   * Durften über die Quellgruppe abfragen, sind aber nicht Mitglied der
   * Zielgruppe. Sie werden nicht still aufgenommen — der Admin entscheidet.
   */
  notMember: string[];
}

/**
 * Wer bekommt beim Umzug des ÖBFV-Tokens die Rolle `kennzeichenabfrage` in
 * der Zielgruppe? Bisher durfte jedes Mitglied der Gruppe mit dem Token
 * abfragen; damit nach dem Umzug niemand den Zugang verliert, erhalten diese
 * Mitglieder die Rolle — sofern sie auch in der Zielgruppe sind.
 */
export function planTokenTransferRoles(
  users: TokenTransferUser[],
  sourceGroupId: string,
  targetGroupId: string,
): TokenTransferPlan {
  const plan: TokenTransferPlan = {
    grant: [],
    alreadyGranted: [],
    notMember: [],
  };
  const has = (roles: GroupRoles, groupId: string) =>
    Object.prototype.hasOwnProperty.call(roles, groupId);

  for (const { uid, groupRoles } of users) {
    if (!has(groupRoles, sourceGroupId)) continue;
    if (!has(groupRoles, targetGroupId)) plan.notMember.push(uid);
    else if (groupRoles[targetGroupId]?.includes('kennzeichenabfrage')) {
      plan.alreadyGranted.push(uid);
    } else plan.grant.push(uid);
  }
  return plan;
}
