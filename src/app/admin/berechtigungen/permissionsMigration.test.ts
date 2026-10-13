import { describe, expect, it } from 'vitest';
import { ROLES_CATALOG_VERSION } from '../../../common/permissions';
import {
  buildMigrationPreview,
  buildUserPreview,
  checkPermissionFields,
  hasLegacyFields,
  legacyCleanupStatus,
  migrationGroupRoles,
  normalizeKostenersatzSelection,
  planLegacyCleanup,
  type MigrationUserRecord,
} from './permissionsMigration';

const legacyUser = (
  overrides: Partial<MigrationUserRecord> = {},
): MigrationUserRecord => ({
  uid: 'u1',
  email: 'max.muster@example.com',
  displayName: 'Max Muster',
  groups: ['ffnd', 'allUsers'],
  ...overrides,
});

describe('buildUserPreview', () => {
  it('rechnet die alten Felder in groupRoles um', () => {
    const preview = buildUserPreview(
      legacyUser({
        groups: ['ffnd', 'ffwien', 'allUsers'],
        groupAdmin: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffwien'],
        bekleidungswart: ['ffnd'],
      }),
    );
    expect(preview.migrated).toBe(false);
    expect(preview.memberGroups).toEqual(['ffnd', 'ffwien']);
    expect(preview.groupRoles).toEqual({
      ffnd: ['bekleidungswart', 'gruppenadmin'],
      ffwien: ['geraetemeister'],
    });
    expect(preview.droppedRoles).toEqual([]);
    expect(preview.hasKostenersatz).toBe(false);
    expect(preview.kostenersatzGroups).toEqual([]);
    expect(preview.withoutTenantGroup).toBe(false);
  });

  it('meldet schlafende Rollen in Gruppen ohne Mitgliedschaft', () => {
    const preview = buildUserPreview(
      legacyUser({
        groups: ['ffnd'],
        groupAdmin: ['ffnd', 'ffwien'],
        bekleidungswart: ['ffalt'],
      }),
    );
    expect(preview.groupRoles).toEqual({ ffnd: ['gruppenadmin'] });
    expect(preview.droppedRoles).toEqual([
      { groupId: 'ffalt', role: 'bekleidungswart' },
      { groupId: 'ffwien', role: 'gruppenadmin' },
    ]);
  });

  it('belegt Kostenersatz mit allen Mitgliedsgruppen vor', () => {
    const preview = buildUserPreview(
      legacyUser({ groups: ['ffnd', 'ffwien', 'kostenersatz', 'allUsers'] }),
    );
    expect(preview.hasKostenersatz).toBe(true);
    expect(preview.kostenersatzGroups).toEqual(['ffnd', 'ffwien']);
    expect(preview.groupRoles).toEqual({
      ffnd: ['kostenersatz'],
      ffwien: ['kostenersatz'],
    });
  });

  it('kennzeichnet Benutzer ohne echte Gruppe', () => {
    expect(
      buildUserPreview(legacyUser({ groups: ['allUsers', 'kostenersatz'] }))
        .withoutTenantGroup,
    ).toBe(true);
    expect(
      buildUserPreview(legacyUser({ groups: undefined })).withoutTenantGroup,
    ).toBe(true);
  });

  it('übernimmt bei migrierten Benutzern die vorhandenen Rollen', () => {
    const preview = buildUserPreview(
      legacyUser({
        groups: ['ffnd', 'ffwien'],
        groupAdmin: ['ffwien'],
        groupRoles: { ffnd: ['geraetemeister'] },
      }),
    );
    expect(preview.migrated).toBe(true);
    expect(preview.groupRoles).toEqual({ ffnd: ['geraetemeister'] });
    expect(preview.droppedRoles).toEqual([]);
  });

  it('nimmt als Bezeichnung Name, sonst E-Mail, sonst UID', () => {
    expect(buildUserPreview(legacyUser()).label).toBe('Max Muster');
    expect(
      buildUserPreview(legacyUser({ displayName: undefined })).label,
    ).toBe('max.muster@example.com');
    expect(
      buildUserPreview(
        legacyUser({ displayName: undefined, email: undefined }),
      ).label,
    ).toBe('u1');
  });
});

describe('buildMigrationPreview', () => {
  it('sortiert: nicht migrierte zuerst, dann nach Bezeichnung', () => {
    const previews = buildMigrationPreview([
      legacyUser({ uid: 'a', displayName: 'Zoe', groupRoles: {} }),
      legacyUser({ uid: 'b', displayName: 'Bert' }),
      legacyUser({ uid: 'c', displayName: 'Anna' }),
    ]);
    expect(previews.map((p) => p.uid)).toEqual(['c', 'b', 'a']);
  });
});

describe('normalizeKostenersatzSelection', () => {
  it('lässt nur Mitgliedsgruppen zu', () => {
    const user = legacyUser({ groups: ['ffnd', 'ffwien', 'kostenersatz'] });
    expect(normalizeKostenersatzSelection(user, ['ffwien', 'fremd'])).toEqual([
      'ffwien',
    ]);
  });

  it('ignoriert eine Auswahl ohne Kostenersatz-Freischaltung', () => {
    const user = legacyUser({ groups: ['ffnd'] });
    expect(normalizeKostenersatzSelection(user, ['ffnd'])).toEqual([]);
  });

  it('ohne Auswahl bleibt es bei der Vorbelegung', () => {
    const user = legacyUser({ groups: ['ffnd', 'kostenersatz'] });
    expect(normalizeKostenersatzSelection(user, undefined)).toBeUndefined();
  });

  it('verwirft Unsinn statt zu scheitern', () => {
    const user = legacyUser({ groups: ['ffnd', 'kostenersatz'] });
    expect(
      normalizeKostenersatzSelection(user, 'ffnd' as unknown as string[]),
    ).toBeUndefined();
    expect(
      normalizeKostenersatzSelection(user, [1, 'ffnd'] as unknown as string[]),
    ).toEqual(['ffnd']);
  });
});

describe('migrationGroupRoles', () => {
  it('vergibt Kostenersatz nur in den angehakten Gruppen', () => {
    const user = legacyUser({
      groups: ['ffnd', 'ffwien', 'kostenersatz'],
      groupAdmin: ['ffwien'],
    });
    expect(migrationGroupRoles(user, ['ffnd'])).toEqual({
      ffnd: ['kostenersatz'],
      ffwien: ['gruppenadmin'],
    });
  });

  it('kein Häkchen: keine Kostenersatz-Rolle', () => {
    const user = legacyUser({ groups: ['ffnd', 'kostenersatz'] });
    expect(migrationGroupRoles(user, [])).toEqual({ ffnd: [] });
  });

  it('ohne Auswahl verhaltensgleich in allen Mitgliedsgruppen', () => {
    const user = legacyUser({ groups: ['ffnd', 'ffwien', 'kostenersatz'] });
    expect(migrationGroupRoles(user, undefined)).toEqual({
      ffnd: ['kostenersatz'],
      ffwien: ['kostenersatz'],
    });
  });
});

describe('hasLegacyFields', () => {
  it('erkennt jedes alte Feld, auch leer', () => {
    expect(hasLegacyFields(legacyUser())).toBe(false);
    expect(hasLegacyFields(legacyUser({ groupAdmin: [] }))).toBe(true);
    expect(
      hasLegacyFields(legacyUser({ fahrtenbuchGeraetemeister: ['ffnd'] })),
    ).toBe(true);
    expect(hasLegacyFields(legacyUser({ bekleidungswart: [] }))).toBe(true);
    expect(
      hasLegacyFields(legacyUser({ groups: ['ffnd', 'kostenersatz'] })),
    ).toBe(true);
  });
});

describe('legacyCleanupStatus', () => {
  it('gibt erst frei, wenn alle Benutzer migriert sind', () => {
    const status = legacyCleanupStatus([
      legacyUser({ uid: 'a', groupRoles: {} }),
      legacyUser({ uid: 'b' }),
    ]);
    expect(status).toEqual({
      allowed: false,
      notMigrated: 1,
      withLegacyFields: 0,
      total: 2,
    });
  });

  it('frei, wenn alle migriert sind, und zählt alte Felder', () => {
    const status = legacyCleanupStatus([
      legacyUser({ uid: 'a', groupRoles: {}, groupAdmin: ['ffnd'] }),
      legacyUser({ uid: 'b', groupRoles: { ffnd: [] } }),
    ]);
    expect(status).toEqual({
      allowed: true,
      notMigrated: 0,
      withLegacyFields: 1,
      total: 2,
    });
  });

  it('ohne Benutzer nicht frei', () => {
    expect(legacyCleanupStatus([]).allowed).toBe(false);
  });
});

describe('planLegacyCleanup', () => {
  it('löscht die Rollenfelder und kostenersatz aus groups', () => {
    const plan = planLegacyCleanup(
      legacyUser({
        groups: ['ffnd', 'kostenersatz', 'allUsers'],
        groupAdmin: ['ffnd'],
        bekleidungswart: [],
        groupRoles: { ffnd: ['gruppenadmin', 'kostenersatz'] },
      }),
    );
    expect(plan).toEqual({
      removeFields: ['groupAdmin', 'bekleidungswart'],
      groups: ['ffnd', 'allUsers'],
      claimGroups: ['ffnd'],
      changed: true,
    });
  });

  it('Claims aus der Mitgliedschaft in groupRoles, nicht aus groups', () => {
    const plan = planLegacyCleanup(
      legacyUser({
        groups: ['ffnd', 'ffalt'],
        groupRoles: { ffnd: [], ffneu: [] },
      }),
    );
    expect(plan).toEqual({
      removeFields: [],
      groups: undefined,
      claimGroups: ['ffnd', 'ffneu'],
      changed: false,
    });
  });
});

describe('checkPermissionFields', () => {
  const migrated = (overrides: Partial<MigrationUserRecord> = {}) =>
    legacyUser({
      groupRoles: { ffnd: ['bekleidungswart'] },
      groupPerms: { ffnd: ['bekleidung.manage', 'bekleidung.read'] },
      permsAny: ['bekleidung.manage', 'bekleidung.read'],
      rolesCatalogVersion: ROLES_CATALOG_VERSION,
      ...overrides,
    });

  it('stimmig: keine Abweichung', () => {
    expect(checkPermissionFields(migrated())).toEqual([]);
  });

  it('Reihenfolge ist keine Abweichung', () => {
    expect(
      checkPermissionFields(
        migrated({
          groupPerms: { ffnd: ['bekleidung.read', 'bekleidung.manage'] },
          permsAny: ['bekleidung.read', 'bekleidung.manage'],
        }),
      ),
    ).toEqual([]);
  });

  it('nicht migriert', () => {
    expect(checkPermissionFields(legacyUser())).toEqual(['notMigrated']);
  });

  it('meldet veraltete und falsche Ableitungen', () => {
    expect(
      checkPermissionFields(
        migrated({
          rolesCatalogVersion: undefined,
          groupPerms: { ffnd: ['bekleidung.read'], ffalt: [] },
          permsAny: ['bekleidung.read'],
        }),
      ),
    ).toEqual(['catalogVersion', 'groupPerms', 'permsAny']);
  });

  it('meldet unbekannte Rollen und Nicht-Mandanten in groupRoles', () => {
    expect(
      checkPermissionFields(
        migrated({
          groupRoles: {
            ffnd: ['bekleidungswart', 'gibtsnicht' as never],
            allUsers: [],
          },
        }),
      ),
    ).toEqual(['unknownRole', 'nonTenantGroup']);
  });
});
