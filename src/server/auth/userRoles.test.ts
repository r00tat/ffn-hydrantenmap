import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { setClaimsMock, invalidateMock, DELETE } = vi.hoisted(() => ({
  setClaimsMock: vi.fn(),
  invalidateMock: vi.fn(),
  DELETE: Symbol('delete'),
}));

// Ein Benutzerdokument im Speicher. Die Transaktion wendet die Feldpfade so an,
// wie Firestore es täte — geprüft wird das Ergebnis, nicht die Aufrufform.
let store: Record<string, Record<string, unknown> | undefined> = {};

vi.mock('firebase-admin/firestore', () => {
  class FieldPath {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  }
  return { FieldPath, FieldValue: { delete: () => DELETE } };
});

function applyUpdate(uid: string, args: unknown[]) {
  const doc = store[uid];
  if (!doc) throw new Error('NOT_FOUND');
  for (let i = 0; i < args.length; i += 2) {
    const segments = (args[i] as { segments: string[] }).segments;
    const value = args[i + 1];
    let target: Record<string, unknown> = doc;
    for (const segment of segments.slice(0, -1)) {
      if (typeof target[segment] !== 'object' || target[segment] === null) {
        target[segment] = {};
      }
      target = target[segment] as Record<string, unknown>;
    }
    const last = segments[segments.length - 1];
    if (value === DELETE) delete target[last];
    else target[last] = structuredClone(value);
  }
}

const updateCalls: unknown[][] = [];

vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: (uid: string) => ({ id: uid }) }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { id: string }) => Promise<unknown>;
        update: (ref: { id: string }, ...args: unknown[]) => void;
      }) => Promise<unknown>,
    ) =>
      fn({
        get: async (ref) => {
          const data = store[ref.id];
          return {
            exists: data !== undefined,
            data: () => (data ? structuredClone(data) : undefined),
          };
        },
        update: (ref, ...args) => {
          updateCalls.push(args);
          applyUpdate(ref.id, args);
        },
      }),
  },
}));
vi.mock('../../app/api/users/[uid]/updateUser', () => ({
  setCustomClaimsForUser: (uid: string, claims: unknown) => setClaimsMock(uid, claims),
}));
vi.mock('./userSessionCache', () => ({
  userSessionCache: { invalidate: (uid: string) => invalidateMock(uid) },
}));

import { ROLES_CATALOG_VERSION } from '../../common/permissions';
import { recomputeUserPermissions, writeUserRoles } from './userRoles';

beforeEach(() => {
  store = {};
  updateCalls.length = 0;
  setClaimsMock.mockReset().mockResolvedValue(undefined);
  invalidateMock.mockReset();
});

function member(groupRoles: Record<string, string[]>, extra: Record<string, unknown> = {}) {
  return {
    authorized: true,
    isAdmin: false,
    groups: ['allUsers', ...Object.keys(groupRoles)],
    groupRoles,
    groupPerms: {},
    permsAny: [],
    rolesCatalogVersion: ROLES_CATALOG_VERSION,
    ...extra,
  };
}

describe('writeUserRoles', () => {
  it('ersetzt die Rollen einer Gruppe und leitet die Rechte ab', async () => {
    store.u1 = member({ ffnd: [], ffxy: ['kostenersatz'] });

    const result = await writeUserRoles('u1', {
      kind: 'setGroupRoles',
      groupId: 'ffnd',
      roles: ['geraetemeister'],
    });

    expect(result).toEqual({ ffnd: ['geraetemeister'], ffxy: ['kostenersatz'] });
    expect(store.u1?.groupRoles).toEqual(result);
    expect(store.u1?.groupPerms).toEqual({
      ffnd: ['fahrtenbuch.manage', 'geraete.manage', 'personal.manage'],
      ffxy: ['kostenersatz.use'],
    });
    expect(store.u1?.permsAny).toEqual([
      'fahrtenbuch.manage',
      'geraete.manage',
      'kostenersatz.use',
      'personal.manage',
    ]);
    expect(store.u1?.rolesCatalogVersion).toBe(ROLES_CATALOG_VERSION);
  });

  it('setzt bei reiner Rollenänderung keine Claims, invalidiert aber die Sitzung', async () => {
    store.u1 = member({ ffnd: [] });
    await writeUserRoles('u1', { kind: 'setGroupRoles', groupId: 'ffnd', roles: ['kostenersatz'] });
    expect(setClaimsMock).not.toHaveBeenCalled();
    expect(invalidateMock).toHaveBeenCalledWith('u1');
  });

  it('schreibt per Feldpfad je Gruppe, nicht das ganze Feld', async () => {
    store.u1 = member({ ffnd: [], 'ff.punkt': [] });
    await writeUserRoles('u1', { kind: 'setGroupRoles', groupId: 'ffnd', roles: ['kostenersatz'] });
    const paths = updateCalls[0]
      .filter((_, i) => i % 2 === 0)
      .map((p) => (p as { segments: string[] }).segments);
    expect(paths).toContainEqual(['groupRoles', 'ffnd']);
    expect(paths).not.toContainEqual(['groupRoles']);
    // Gruppen-IDs mit Punkt bleiben ein Segment.
    expect(store.u1?.groupPerms).toHaveProperty(['ff.punkt']);
  });

  it('bereinigt Rollen: unbekannte weg, doppelte einmal, sortiert', async () => {
    store.u1 = member({ ffnd: [] });
    const result = await writeUserRoles('u1', {
      kind: 'setGroupRoles',
      groupId: 'ffnd',
      roles: ['kostenersatz', 'unbekannt', 'bekleidungswart', 'kostenersatz'] as never,
    });
    expect(result.ffnd).toEqual(['bekleidungswart', 'kostenersatz']);
  });

  it('verweigert Rollen in einer Gruppe ohne Mitgliedschaft', async () => {
    store.u1 = member({ ffnd: [] });
    await expect(
      writeUserRoles('u1', { kind: 'setGroupRoles', groupId: 'ffxy', roles: ['kostenersatz'] }),
    ).rejects.toThrow(/not a member/);
    expect(store.u1?.groupRoles).toEqual({ ffnd: [] });
  });

  it.each(['', 'allUsers', 'kostenersatz'])(
    'verweigert die Nicht-Mandanten-Gruppe %s',
    async (groupId) => {
      store.u1 = member({ ffnd: [] });
      await expect(writeUserRoles('u1', { kind: 'addMember', groupId })).rejects.toThrow();
    },
  );

  it('nimmt in eine Gruppe auf und setzt die Claims neu', async () => {
    store.u1 = member({ ffnd: [] });

    await writeUserRoles('u1', { kind: 'addMember', groupId: 'ffxy', roles: ['bekleidungswart'] });

    expect(store.u1?.groupRoles).toEqual({ ffnd: [], ffxy: ['bekleidungswart'] });
    expect(setClaimsMock).toHaveBeenCalledTimes(1);
    const [uid, claims] = setClaimsMock.mock.calls[0];
    expect(uid).toBe('u1');
    expect([...claims.groups].sort()).toEqual(['allUsers', 'ffnd', 'ffxy']);
    expect(claims).toMatchObject({ isAdmin: false, authorized: true });
    expect(invalidateMock).toHaveBeenCalledWith('u1');
  });

  it('lässt beim Aufnehmen bestehende Rollen der Gruppe stehen, wenn keine angegeben sind', async () => {
    store.u1 = member({ ffnd: ['kostenersatz'] });
    await writeUserRoles('u1', { kind: 'addMember', groupId: 'ffnd' });
    expect(store.u1?.groupRoles).toEqual({ ffnd: ['kostenersatz'] });
  });

  it('meldet einen Fehler beim Setzen der Claims an den Aufrufer', async () => {
    store.u1 = member({ ffnd: [], ffxy: [] });
    setClaimsMock.mockRejectedValueOnce(new Error('auth down'));

    await expect(
      writeUserRoles('u1', { kind: 'removeMember', groupId: 'ffxy' }),
    ).rejects.toThrow('auth down');
  });

  it('setzt die Claims beim erneuten Entfernen, auch wenn das Dokument schon stimmt', async () => {
    // Ein gescheiterter Claim-Aufruf lässt sich so durch Wiederholen reparieren.
    store.u1 = member({ ffnd: [] });

    await writeUserRoles('u1', { kind: 'removeMember', groupId: 'ffxy' });

    expect(setClaimsMock).toHaveBeenCalledTimes(1);
    expect([...setClaimsMock.mock.calls[0][1].groups].sort()).toEqual(['allUsers', 'ffnd']);
  });

  it('entfernt mit der Mitgliedschaft alle Rollen der Gruppe', async () => {
    store.u1 = member({ ffnd: [], ffxy: ['gruppenadmin'] });
    store.u1.groupPerms = { ffnd: [], ffxy: ['gruppe.manage'] };

    const result = await writeUserRoles('u1', { kind: 'removeMember', groupId: 'ffxy' });

    expect(result).toEqual({ ffnd: [] });
    expect(store.u1?.groupRoles).toEqual({ ffnd: [] });
    expect(store.u1?.groupPerms).toEqual({ ffnd: [] });
    expect(store.u1?.permsAny).toEqual([]);
    expect([...setClaimsMock.mock.calls[0][1].groups].sort()).toEqual(['allUsers', 'ffnd']);
  });

  it('lässt die Schein-Gruppe kostenersatz im Claim, solange sie in groups steht', async () => {
    store.u1 = member({ ffnd: [] }, { groups: ['allUsers', 'ffnd', 'kostenersatz'] });
    await writeUserRoles('u1', { kind: 'addMember', groupId: 'ffxy' });
    expect([...setClaimsMock.mock.calls[0][1].groups].sort()).toEqual([
      'allUsers',
      'ffnd',
      'ffxy',
      'kostenersatz',
    ]);
  });

  it('behält die Gast-Claims eines Einsatz-Gasts', async () => {
    store.u1 = member(
      {},
      { firecall: 'call-1', firecallWrite: false, firecallExpiresAt: 1234 },
    );
    await writeUserRoles('u1', { kind: 'addMember', groupId: 'ffnd' });
    expect(setClaimsMock.mock.calls[0][1]).toMatchObject({
      firecall: 'call-1',
      firecallWrite: false,
      firecallExpires: 1234,
    });
  });

  it('ersetzt alles bei replaceAll und lässt Nicht-Mandanten aus', async () => {
    store.u1 = { authorized: true, groups: ['allUsers', 'ffnd', 'kostenersatz'] };

    const result = await writeUserRoles('u1', {
      kind: 'replaceAll',
      groupRoles: { ffnd: ['kostenersatz'], allUsers: ['gruppenadmin'] },
    });

    expect(result).toEqual({ ffnd: ['kostenersatz'] });
    expect(store.u1?.groupRoles).toEqual({ ffnd: ['kostenersatz'] });
    expect(store.u1?.groupPerms).toEqual({ ffnd: ['kostenersatz.use'] });
    expect(store.u1?.permsAny).toEqual(['kostenersatz.use']);
    expect(store.u1?.rolesCatalogVersion).toBe(ROLES_CATALOG_VERSION);
    // Die alten Felder bleiben unverändert — Rollback ohne Datenreparatur.
    expect(store.u1?.groups).toEqual(['allUsers', 'ffnd', 'kostenersatz']);
  });

  it('lässt die Claims bei der Migration unverändert', async () => {
    // Ohne groupRoles gilt die alte Mitgliedschaft aus `groups` als Vorher —
    // die Migration ändert sie nicht, also bleiben die Claims, wie sie sind.
    store.u1 = { authorized: true, groups: ['allUsers', 'ffnd', 'kostenersatz'] };
    await writeUserRoles('u1', { kind: 'replaceAll', groupRoles: { ffnd: ['kostenersatz'] } });
    expect(setClaimsMock).not.toHaveBeenCalled();
  });

  it('setzt bei replaceAll die Claims, wenn sich die Mitgliedschaft ändert', async () => {
    store.u1 = member({ ffnd: [] });
    await writeUserRoles('u1', { kind: 'replaceAll', groupRoles: { ffxy: [] } });
    expect([...setClaimsMock.mock.calls[0][1].groups].sort()).toEqual(['allUsers', 'ffxy']);
  });

  it('wirft für einen unbekannten Benutzer', async () => {
    await expect(writeUserRoles('nope', { kind: 'addMember', groupId: 'ffnd' })).rejects.toThrow(
      /does not exist/,
    );
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});

describe('recomputeUserPermissions', () => {
  it('schreibt veraltete Ableitungen neu und meldet die Änderung', async () => {
    store.u1 = member({ ffnd: ['kostenersatz'] }, { rolesCatalogVersion: 0, groupPerms: {} });

    await expect(recomputeUserPermissions('u1')).resolves.toBe(true);

    expect(store.u1?.groupPerms).toEqual({ ffnd: ['kostenersatz.use'] });
    expect(store.u1?.permsAny).toEqual(['kostenersatz.use']);
    expect(store.u1?.rolesCatalogVersion).toBe(ROLES_CATALOG_VERSION);
    expect(invalidateMock).toHaveBeenCalledWith('u1');
    expect(setClaimsMock).not.toHaveBeenCalled();
  });

  it('schreibt nichts, wenn die Ableitung aktuell ist', async () => {
    store.u1 = member(
      { ffnd: ['kostenersatz'] },
      { groupPerms: { ffnd: ['kostenersatz.use'] }, permsAny: ['kostenersatz.use'] },
    );
    await expect(recomputeUserPermissions('u1')).resolves.toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it('legt für nicht migrierte Benutzer nichts an', async () => {
    store.u1 = { authorized: true, groups: ['ffnd'] };
    await expect(recomputeUserPermissions('u1')).resolves.toBe(false);
    expect(store.u1?.groupRoles).toBeUndefined();
  });

  it('liefert für einen unbekannten Benutzer false', async () => {
    await expect(recomputeUserPermissions('nope')).resolves.toBe(false);
  });
});

describe('writeUserRoles mit toggleRole', () => {
  it('schaltet die Rolle auf dem in der Transaktion gelesenen Stand um', async () => {
    // Der Aufrufer hat noch ['bekleidungswart', 'kostenersatz'] gesehen;
    // kostenersatz ist inzwischen entzogen und darf nicht zurückkommen.
    store.u1 = member({ ffnd: ['bekleidungswart'] });

    const result = await writeUserRoles('u1', {
      kind: 'toggleRole',
      groupId: 'ffnd',
      role: 'geraetemeister',
      enabled: true,
    });

    expect(result).toEqual({ ffnd: ['bekleidungswart', 'geraetemeister'] });
    expect(store.u1?.groupPerms).toEqual({
      ffnd: [
        'bekleidung.manage',
        'bekleidung.read',
        'fahrtenbuch.manage',
        'geraete.manage',
        'personal.manage',
      ],
    });
  });

  it('entzieht nur die eine Rolle', async () => {
    store.u1 = member({ ffnd: ['geraetemeister', 'kostenersatz'] });

    const result = await writeUserRoles('u1', {
      kind: 'toggleRole',
      groupId: 'ffnd',
      role: 'kostenersatz',
      enabled: false,
    });

    expect(result).toEqual({ ffnd: ['geraetemeister'] });
  });

  it('nimmt niemanden über eine Rolle in die Gruppe auf', async () => {
    store.u1 = member({ ffxy: [] });

    await expect(
      writeUserRoles('u1', {
        kind: 'toggleRole',
        groupId: 'ffnd',
        role: 'kostenersatz',
        enabled: true,
      }),
    ).rejects.toThrow(/not a member/);
    expect(store.u1?.groupRoles).toEqual({ ffxy: [] });
  });

  it('lehnt eine unbekannte Rolle ab', async () => {
    store.u1 = member({ ffnd: [] });

    await expect(
      writeUserRoles('u1', {
        kind: 'toggleRole',
        groupId: 'ffnd',
        role: 'superuser' as never,
        enabled: true,
      }),
    ).rejects.toThrow(/role/);
  });
});
