/**
 * Gruppenrollen und Rechte — die einzige Entscheidungsstelle.
 *
 * Ein Benutzer ist Mitglied einer Gruppe und hat **in dieser Gruppe** Rollen.
 * Eine Rolle ist ein im Code definiertes Bündel von Rechten. Geprüft wird
 * immer ein Recht, nie eine Rolle — so wird ein späteres Aufteilen einer Rolle
 * zur Katalogänderung statt zur Suche nach Aufrufstellen.
 *
 * Rein, ohne NextAuth- und Firebase-Import: Server (Guards), Client (Hooks)
 * und Migration benutzen dieselbe Logik. Hintergrund: docs/berechtigungen.md.
 */

import { isTenantGroupId } from './tenantGroups';

/**
 * Die Rechte. Die Werte sind persistiert (`groupPerms`/`permsAny` am
 * Benutzerdokument, Firestore-Regeln) und deshalb stabil zu halten.
 */
export const PERMISSIONS = [
  'fahrtenbuch.manage',
  'geraete.manage',
  'personal.manage',
  'bekleidung.read',
  'bekleidung.manage',
  'kostenersatz.use',
  'gruppe.manage',
  'rollen.assign',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Die Rollen. `gruppenadmin` enthält bewusst nicht `kostenersatz.use`: Ein
 * Gruppen-Admin ohne Freischaltung sieht keinen Kostenersatz.
 */
export const ROLES = {
  gruppenadmin: [
    'gruppe.manage',
    'rollen.assign',
    'fahrtenbuch.manage',
    'geraete.manage',
    'personal.manage',
    'bekleidung.read',
    'bekleidung.manage',
  ],
  geraetemeister: ['fahrtenbuch.manage', 'geraete.manage', 'personal.manage'],
  bekleidungswart: ['bekleidung.read', 'bekleidung.manage'],
  kostenersatz: ['kostenersatz.use'],
} as const satisfies Record<string, readonly Permission[]>;
export type RoleId = keyof typeof ROLES;
export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

/**
 * Stand des Katalogs. Jede Änderung an `ROLES` erhöht ihn, damit
 * `getUserSessionData` die abgeleiteten Felder älterer Benutzerdokumente neu
 * schreibt — die Firestore-Regeln lesen nur diese.
 */
export const ROLES_CATALOG_VERSION = 1;

/** Rollen je Gruppe. Ein Schlüssel bedeutet Mitgliedschaft, auch mit `[]`. */
export type GroupRoles = Record<string, RoleId[]>;

/** Die Felder der Session (oder des Benutzers), an denen die Entscheidung hängt. */
export interface PermissionUser {
  isAdmin?: boolean;
  groupRoles?: GroupRoles;
}

export function isRoleId(v: unknown): v is RoleId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROLES, v);
}

function rolesIn(user: PermissionUser, groupId: string): RoleId[] | undefined {
  const groupRoles = user.groupRoles;
  if (!groupRoles || !isTenantGroupId(groupId)) return undefined;
  // hasOwnProperty statt `in`: `toString` oder `__proto__` sind keine Gruppen.
  if (!Object.prototype.hasOwnProperty.call(groupRoles, groupId)) {
    return undefined;
  }
  return Array.isArray(groupRoles[groupId]) ? groupRoles[groupId] : [];
}

/**
 * Ist der Benutzer Mitglied der Gruppe?
 *
 * Die Asymmetrie ist Absicht: Der globale Admin braucht keine Mitgliedschaft,
 * sonst nähme man ihm Rechte, die er unter `actionAdminRequired()` immer hatte.
 * Nicht-Mandanten (`allUsers`, `kostenersatz`) sind nie eine Mitgliedschaft.
 */
export function isMember(user: PermissionUser, groupId: string): boolean {
  if (user.isAdmin) return true;
  return rolesIn(user, groupId) !== undefined;
}

/** Hat der Benutzer das Recht in dieser Gruppe? Der globale Admin immer. */
export function can(
  user: PermissionUser,
  groupId: string,
  perm: Permission,
): boolean {
  if (user.isAdmin) return true;
  const roles = rolesIn(user, groupId);
  if (!roles) return false;
  return roles.some(
    (role) => isRoleId(role) && (ROLES[role] as readonly Permission[]).includes(perm),
  );
}

/**
 * Hat der Benutzer das Recht in irgendeiner Gruppe? Für Menüeinträge und
 * Seitenschutz, die nur wissen müssen, *ob* eine Seite erreichbar ist.
 */
export function canAny(user: PermissionUser, perm: Permission): boolean {
  if (user.isAdmin) return true;
  return memberGroupIds(user).some((groupId) => can(user, groupId, perm));
}

/**
 * Die Gruppen, in denen der Benutzer Mitglied ist — ohne Nicht-Mandanten.
 * Der globale Admin ist dadurch nicht Mitglied jeder Gruppe.
 */
export function memberGroupIds(user: PermissionUser): string[] {
  return Object.keys(user.groupRoles ?? {}).filter(isTenantGroupId);
}

/** Die Rechte einer Rollenliste, sortiert und eindeutig. */
export function permissionsFor(roles: readonly RoleId[]): Permission[] {
  const perms = new Set<Permission>();
  for (const role of roles) {
    if (!isRoleId(role)) continue;
    for (const perm of ROLES[role]) perms.add(perm);
  }
  return [...perms].sort();
}

/**
 * Die abgeleiteten Felder am Benutzerdokument. Nur die Firestore-Regeln lesen
 * sie; Server und Client rechnen aus `groupRoles` und dem Katalog, damit sie
 * nach einem Deploy sofort auf dem neuen Stand sind.
 */
export function derivePermissionFields(groupRoles: GroupRoles): {
  groupPerms: Record<string, Permission[]>;
  permsAny: Permission[];
} {
  const groupPerms: Record<string, Permission[]> = {};
  const any = new Set<Permission>();
  for (const groupId of memberGroupIds({ groupRoles })) {
    const perms = permissionsFor(groupRoles[groupId] ?? []);
    groupPerms[groupId] = perms;
    perms.forEach((perm) => any.add(perm));
  }
  return { groupPerms, permsAny: [...any].sort() };
}

/**
 * Darf `actor` die Rolle in dieser Gruppe vergeben oder entziehen?
 *
 * `gruppenadmin` vergibt nur der globale Admin. Sonst braucht es
 * `rollen.assign` **und** alle Rechte der Rolle selbst (Teilmengenregel): Wer
 * keinen Kostenersatz macht, gibt ihn nicht weiter.
 */
export function canAssignRole(
  actor: PermissionUser,
  groupId: string,
  role: RoleId,
): boolean {
  if (actor.isAdmin) return true;
  if (role === 'gruppenadmin' || !isRoleId(role)) return false;
  if (!can(actor, groupId, 'rollen.assign')) return false;
  return ROLES[role].every((perm) => can(actor, groupId, perm));
}

// --- Migration (bleibt bis zum Aufräum-PR, im Offline-Cache-Leser länger) ---

/** Die Rollenfelder vor `groupRoles`. */
export interface LegacyRoleFields {
  groups?: string[];
  groupAdmin?: string[];
  fahrtenbuchGeraetemeister?: string[];
  bekleidungswart?: string[];
}

const LEGACY_KOSTENERSATZ_GROUP = 'kostenersatz';

/**
 * Rechnet die alten Rollenfelder in `groupRoles` um.
 *
 * - Mitgliedschaft = `groups` ohne Nicht-Mandanten.
 * - Rollen nur in Gruppen mit Mitgliedschaft; schlafende Rollen entfallen.
 * - Kostenersatz: Ohne `kostenersatzGroups` gilt die bisherige globale
 *   Freischaltung (`'kostenersatz'` in `groups`) in allen Mitgliedsgruppen —
 *   verhaltensgleich. Mit Vorgabe nur in deren Schnittmenge mit der
 *   Mitgliedschaft.
 */
export function legacyToGroupRoles(
  legacy: LegacyRoleFields,
  kostenersatzGroups?: string[],
): GroupRoles {
  const members = [...new Set((legacy.groups ?? []).filter(isTenantGroupId))];
  const kostenersatzIn =
    kostenersatzGroups ??
    ((legacy.groups ?? []).includes(LEGACY_KOSTENERSATZ_GROUP) ? members : []);

  const result: GroupRoles = {};
  for (const groupId of members) {
    const roles: RoleId[] = [];
    if (legacy.groupAdmin?.includes(groupId)) roles.push('gruppenadmin');
    if (legacy.fahrtenbuchGeraetemeister?.includes(groupId)) {
      roles.push('geraetemeister');
    }
    if (legacy.bekleidungswart?.includes(groupId)) roles.push('bekleidungswart');
    if (kostenersatzIn.includes(groupId)) roles.push('kostenersatz');
    result[groupId] = roles.sort();
  }
  return result;
}
