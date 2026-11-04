import { memberGroupIds, type PermissionUser } from '../common/permissions';
import { isTenantGroupId } from '../common/tenantGroups';

/**
 * In welchen Gruppen nach Atemschutzausrüstung gesucht wird.
 *
 * Die Arbeitsgruppe — die des Einsatzes oder die im Füllprotokoll gewählte —
 * zuerst, danach jede weitere Gruppe, in der der Benutzer Mitglied ist. Ein
 * Bezirkseinsatz soll die Flaschen der eigenen Feuerwehr finden, ohne dass sie
 * ein zweites Mal im Bezirk importiert werden müssen. Gelesen wird damit nur,
 * was die Regeln (`member(groupId)`) ohnehin herausgeben.
 *
 * Ohne Arbeitsgruppe bleibt die Liste leer: Eine Seite ohne Einsatz oder ohne
 * gewählte Gruppe hat nichts, wohin eine Füllung geschrieben würde.
 */
export function atemschutzSearchGroupIds(
  groupId: string | undefined,
  user: PermissionUser,
): string[] {
  if (!isTenantGroupId(groupId)) return [];
  return [
    groupId,
    ...memberGroupIds(user).filter((other) => other !== groupId),
  ];
}
