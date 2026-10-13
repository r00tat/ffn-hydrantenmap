/**
 * Migration der alten Rollenfelder auf `groupRoles` — die reine Logik der
 * Seite `/admin/berechtigungen`. Die Server Actions (`actions.ts`) lesen,
 * schreiben und protokollieren; was sie schreiben, wird hier entschieden.
 *
 * Wird mit dem Aufräum-PR nach dem Release entfernt, bis auf
 * `checkPermissionFields` für „Rechte neu ableiten".
 */

import {
  derivePermissionFields,
  isRoleId,
  legacyToGroupRoles,
  memberGroupIds,
  ROLES_CATALOG_VERSION,
  type GroupRoles,
  type LegacyRoleFields,
  type Permission,
  type RoleId,
} from '../../../common/permissions';
import { isTenantGroupId } from '../../../common/tenantGroups';

/** Was die Migration von einem Benutzer braucht: Firestore-Dokument + Anzeige. */
export interface MigrationUserRecord extends LegacyRoleFields {
  uid: string;
  email?: string;
  displayName?: string;
  groupRoles?: GroupRoles;
  groupPerms?: Record<string, string[]>;
  permsAny?: string[];
  rolesCatalogVersion?: number;
}

export interface DroppedRole {
  groupId: string;
  role: RoleId;
}

export interface UserMigrationPreview {
  uid: string;
  label: string;
  email?: string;
  /** Hat bereits `groupRoles` und wird beim Migrieren übersprungen. */
  migrated: boolean;
  legacy: {
    groups: string[];
    groupAdmin: string[];
    fahrtenbuchGeraetemeister: string[];
    bekleidungswart: string[];
  };
  memberGroups: string[];
  /** `'kostenersatz'` steht in `groups` — die Seite zeigt dann die Häkchen. */
  hasKostenersatz: boolean;
  /** Vorbelegung der Häkchen: alle Mitgliedsgruppen (verhaltensgleich). */
  kostenersatzGroups: string[];
  /** Das Ergebnis der Migration, bei migrierten Benutzern der Bestand. */
  groupRoles: GroupRoles;
  /** Rollen in Gruppen ohne Mitgliedschaft; sie entfallen. */
  droppedRoles: DroppedRole[];
  /** Nur `allUsers`/`kostenersatz`, keine echte Gruppe. */
  withoutTenantGroup: boolean;
}

const LEGACY_KOSTENERSATZ_GROUP = 'kostenersatz';

const LEGACY_ROLE_FIELDS = [
  ['groupAdmin', 'gruppenadmin'],
  ['fahrtenbuchGeraetemeister', 'geraetemeister'],
  ['bekleidungswart', 'bekleidungswart'],
] as const satisfies readonly (readonly [keyof LegacyRoleFields, RoleId])[];

export type LegacyRoleField = (typeof LEGACY_ROLE_FIELDS)[number][0];

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

export function isMigrated(user: MigrationUserRecord): boolean {
  return !!user.groupRoles && typeof user.groupRoles === 'object';
}

function hasKostenersatz(user: MigrationUserRecord): boolean {
  return stringList(user.groups).includes(LEGACY_KOSTENERSATZ_GROUP);
}

function legacyMembers(user: MigrationUserRecord): string[] {
  return [...new Set(stringList(user.groups).filter(isTenantGroupId))];
}

function userLabel(user: MigrationUserRecord): string {
  return user.displayName || user.email || user.uid;
}

/**
 * Die Kostenersatz-Häkchen eines Benutzers, so wie sie gelten dürfen: nur
 * Mitgliedsgruppen und nur, wenn er bisher freigeschaltet war. `undefined`
 * heißt „keine Auswahl getroffen" — dann gilt die Vorbelegung.
 */
export function normalizeKostenersatzSelection(
  user: MigrationUserRecord,
  selection: unknown,
): string[] | undefined {
  if (!hasKostenersatz(user)) return [];
  if (!Array.isArray(selection)) return undefined;
  const members = legacyMembers(user);
  return [...new Set(stringList(selection))].filter((groupId) =>
    members.includes(groupId),
  );
}

/** `groupRoles`, die die Migration für diesen Benutzer schreibt. */
export function migrationGroupRoles(
  user: MigrationUserRecord,
  kostenersatzSelection?: unknown,
): GroupRoles {
  return legacyToGroupRoles(
    {
      groups: stringList(user.groups),
      groupAdmin: stringList(user.groupAdmin),
      fahrtenbuchGeraetemeister: stringList(user.fahrtenbuchGeraetemeister),
      bekleidungswart: stringList(user.bekleidungswart),
    },
    normalizeKostenersatzSelection(user, kostenersatzSelection),
  );
}

export function buildUserPreview(user: MigrationUserRecord): UserMigrationPreview {
  const members = legacyMembers(user);
  const migrated = isMigrated(user);
  const legacy = {
    groups: stringList(user.groups),
    groupAdmin: stringList(user.groupAdmin),
    fahrtenbuchGeraetemeister: stringList(user.fahrtenbuchGeraetemeister),
    bekleidungswart: stringList(user.bekleidungswart),
  };

  const droppedRoles: DroppedRole[] = [];
  if (!migrated) {
    for (const [field, role] of LEGACY_ROLE_FIELDS) {
      for (const groupId of legacy[field]) {
        if (isTenantGroupId(groupId) && !members.includes(groupId)) {
          droppedRoles.push({ groupId, role });
        }
      }
    }
    droppedRoles.sort(
      (a, b) => a.groupId.localeCompare(b.groupId) || a.role.localeCompare(b.role),
    );
  }

  return {
    uid: user.uid,
    label: userLabel(user),
    email: user.email,
    migrated,
    legacy,
    memberGroups: members,
    hasKostenersatz: hasKostenersatz(user),
    kostenersatzGroups: hasKostenersatz(user) ? members : [],
    groupRoles: migrated ? (user.groupRoles as GroupRoles) : migrationGroupRoles(user),
    droppedRoles,
    withoutTenantGroup: members.length === 0,
  };
}

/** Nicht migrierte zuerst — um die geht es auf der Seite. */
export function buildMigrationPreview(
  users: MigrationUserRecord[],
): UserMigrationPreview[] {
  return users
    .map(buildUserPreview)
    .sort(
      (a, b) =>
        Number(a.migrated) - Number(b.migrated) ||
        a.label.localeCompare(b.label, 'de'),
    );
}

/** Steht noch eines der Felder, die Schritt 3 entfernt? Auch leer zählt. */
export function hasLegacyFields(user: MigrationUserRecord): boolean {
  return (
    LEGACY_ROLE_FIELDS.some(([field]) => user[field] !== undefined) ||
    hasKostenersatz(user)
  );
}

export interface LegacyCleanupStatus {
  /** Schritt 3 ist erst frei, wenn niemand mehr auf die alten Felder angewiesen ist. */
  allowed: boolean;
  notMigrated: number;
  withLegacyFields: number;
  total: number;
}

export function legacyCleanupStatus(
  users: MigrationUserRecord[],
): LegacyCleanupStatus {
  const notMigrated = users.filter((u) => !isMigrated(u)).length;
  return {
    allowed: users.length > 0 && notMigrated === 0,
    notMigrated,
    withLegacyFields: users.filter(hasLegacyFields).length,
    total: users.length,
  };
}

export interface LegacyCleanupPlan {
  removeFields: LegacyRoleField[];
  /** Neuer Wert für `groups` (ohne `'kostenersatz'`), `undefined` = unverändert. */
  groups: string[] | undefined;
  /**
   * Gruppen für den Claim — aus `groupRoles`, der Quelle. `allUsers` ergänzt
   * `setCustomClaimsForUser`.
   */
  claimGroups: string[];
  /** Muss das Benutzerdokument geschrieben werden? */
  changed: boolean;
}

export function planLegacyCleanup(user: MigrationUserRecord): LegacyCleanupPlan {
  const removeFields = LEGACY_ROLE_FIELDS.map(([field]) => field).filter(
    (field) => user[field] !== undefined,
  );
  const groups = hasKostenersatz(user)
    ? stringList(user.groups).filter((g) => g !== LEGACY_KOSTENERSATZ_GROUP)
    : undefined;
  return {
    removeFields,
    groups,
    claimGroups: memberGroupIds({ groupRoles: user.groupRoles }),
    changed: removeFields.length > 0 || groups !== undefined,
  };
}

/**
 * Abweichungen der abgeleiteten Felder vom aktuellen Katalog. Die Firestore-
 * Regeln lesen nur `groupPerms`/`permsAny` — eine Abweichung ist also ein
 * Recht, das die Regeln anders sehen als Server und Client.
 */
export type PermissionDeviation =
  | 'notMigrated'
  | 'catalogVersion'
  | 'groupPerms'
  | 'permsAny'
  | 'unknownRole'
  | 'nonTenantGroup';

function sortedGroupPerms(groupPerms: Record<string, unknown> | undefined) {
  return JSON.stringify(
    Object.entries(groupPerms ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupId, perms]) => [groupId, stringList(perms).sort()]),
  );
}

export function checkPermissionFields(
  user: MigrationUserRecord,
): PermissionDeviation[] {
  if (!isMigrated(user)) return ['notMigrated'];
  const groupRoles = user.groupRoles as GroupRoles;

  // Wie `writeUserRoles` normalisiert: nur Mandanten, nur bekannte Rollen.
  const normalized: GroupRoles = {};
  for (const [groupId, roles] of Object.entries(groupRoles)) {
    if (!isTenantGroupId(groupId)) continue;
    normalized[groupId] = stringList(roles).filter(isRoleId);
  }
  const { groupPerms, permsAny } = derivePermissionFields(normalized);

  const deviations: PermissionDeviation[] = [];
  if (user.rolesCatalogVersion !== ROLES_CATALOG_VERSION) {
    deviations.push('catalogVersion');
  }
  if (sortedGroupPerms(user.groupPerms) !== sortedGroupPerms(groupPerms)) {
    deviations.push('groupPerms');
  }
  const storedAny = [...stringList(user.permsAny)].sort();
  if (JSON.stringify(storedAny) !== JSON.stringify(permsAny as Permission[])) {
    deviations.push('permsAny');
  }
  if (
    Object.values(groupRoles).some((roles) =>
      stringList(roles).some((role) => !isRoleId(role)),
    )
  ) {
    deviations.push('unknownRole');
  }
  if (Object.keys(groupRoles).some((groupId) => !isTenantGroupId(groupId))) {
    deviations.push('nonTenantGroup');
  }
  return deviations;
}

// --- Protokoll in appConfig/permissionsMigration ---

export const PERMISSIONS_MIGRATION_DOC = 'permissionsMigration';

export interface MigrationStepError {
  uid: string;
  message: string;
}

export interface MigrationStepResult {
  /** ISO-Zeitpunkt. */
  at: string;
  /** E-Mail des Admins, der den Schritt ausgelöst hat. */
  by: string;
  /** Benutzer, die geschrieben wurden. */
  processed: number;
  /** Benutzer, bei denen nichts zu tun war. */
  skipped: number;
  errors: MigrationStepError[];
}

export interface RecomputeDeviation {
  uid: string;
  label: string;
  deviations: PermissionDeviation[];
}

export interface RecomputeResult extends MigrationStepResult {
  /** Benutzer mit Abweichung vor dem Neuableiten. */
  deviations: RecomputeDeviation[];
  /** Nicht migrierte Benutzer, für die nichts abgeleitet werden kann. */
  notMigrated: number;
}

export interface PermissionsMigrationLog {
  migrate?: MigrationStepResult;
  cleanup?: MigrationStepResult;
  recompute?: RecomputeResult;
}

/** Obergrenze je Liste im Protokoll — das Dokument darf 1 MiB nicht sprengen. */
export const MIGRATION_LOG_LIST_LIMIT = 200;
