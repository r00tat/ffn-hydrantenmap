import { isFirecallGuest } from './firecallGuest';
import { userMemberGroupIds, type UserRolesSource } from './userGroupRoles';
import { isTenantGroupId } from './tenantGroups';

/**
 * Heimatgruppe eines Benutzers (`homeGroup` am Benutzerdokument).
 *
 * Wer in mehreren Gruppen Mitglied ist, landete auf jeder Gruppenseite dort,
 * wo er zuletzt umgeschaltet hatte — und das konnte eine ganz andere Seite
 * gewesen sein. Die Heimatgruppe ist der feste Ausgangspunkt; der Umschalter
 * auf der Seite gilt nur für diese Seite. Hintergrund:
 * docs/berechtigungen.md, Abschnitt „Heimatgruppe".
 */

export interface DefaultGroupInput {
  /** Die Gruppen, die auf dieser Seite zur Auswahl stehen, in Anzeigereihenfolge. */
  groupIds: string[];
  /** Auf dieser Seite von Hand gewählt. */
  manualGroupId?: string;
  homeGroup?: string;
  /** Zuletzt genutzte Gruppe aus dem localStorage. */
  storedGroupId?: string | null;
}

/**
 * Vorauswahl einer Gruppenseite: manuelle Wahl > Heimatgruppe > zuletzt
 * genutzte Gruppe > erste Gruppe. Jede Stufe zählt nur, wenn ihre Gruppe auf
 * dieser Seite zur Auswahl steht — etwa nicht, wenn die Seite ein Recht
 * verlangt, das der Benutzer in seiner Heimatgruppe nicht hat.
 */
export function selectDefaultGroupId({
  groupIds,
  manualGroupId,
  homeGroup,
  storedGroupId,
}: DefaultGroupInput): string | undefined {
  if (groupIds.length === 0) return undefined;
  for (const candidate of [manualGroupId, homeGroup, storedGroupId]) {
    if (candidate && groupIds.includes(candidate)) return candidate;
  }
  return groupIds[0];
}

/** Liest das gespeicherte Feld tolerant: nur eine echte Mandantengruppe zählt. */
export function normalizeHomeGroup(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && isTenantGroupId(trimmed) ? trimmed : undefined;
}

export type HomeGroupWrite =
  | { action: 'keep' }
  | { action: 'delete' }
  | { action: 'set'; groupId: string }
  | { action: 'invalid' };

/**
 * Was mit `homeGroup` geschehen soll. `undefined` heißt „nicht angegeben"
 * (bleibt), leer oder `null` heißt „keine Heimatgruppe" (löschen). Gesetzt
 * wird nur eine Mandantengruppe, in der der Benutzer Mitglied ist.
 */
export function resolveHomeGroupWrite(
  requested: string | null | undefined,
  memberGroupIds: string[],
): HomeGroupWrite {
  if (requested === undefined) return { action: 'keep' };
  const trimmed = requested?.trim() ?? '';
  if (!trimmed) return { action: 'delete' };
  if (!isTenantGroupId(trimmed) || !memberGroupIds.includes(trimmed)) {
    return { action: 'invalid' };
  }
  return { action: 'set', groupId: trimmed };
}

/** Die Heimatgruppe als erste Option im Umschalter, der Rest unverändert. */
export function homeGroupFirst<T extends { id?: string }>(
  groups: T[],
  homeGroup: string | undefined,
): T[] {
  const index = homeGroup ? groups.findIndex((g) => g.id === homeGroup) : -1;
  if (index <= 0) return groups;
  return [groups[index], ...groups.slice(0, index), ...groups.slice(index + 1)];
}

export interface HomeGroupUserSource {
  uid: string;
  data: UserRolesSource & { firecall?: string; homeGroup?: unknown };
}

/**
 * Wer beim „Für alle Mitglieder als Heimatgruppe setzen" geschrieben wird:
 * jedes Mitglied der Gruppe, das sie noch nicht als Heimatgruppe hat.
 * Einsatz-Gäste bleiben draußen — sie sehen keine Gruppenseiten.
 */
export function usersToAssignHomeGroup(
  users: HomeGroupUserSource[],
  groupId: string,
): string[] {
  if (!isTenantGroupId(groupId)) return [];
  return users
    .filter(
      ({ data }) =>
        !isFirecallGuest(data) &&
        normalizeHomeGroup(data.homeGroup) !== groupId &&
        userMemberGroupIds(data).includes(groupId),
    )
    .map(({ uid }) => uid);
}
