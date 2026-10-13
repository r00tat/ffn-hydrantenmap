import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { writeUserRolesMock, userGetMock } = vi.hoisted(() => ({
  writeUserRolesMock: vi.fn(),
  userGetMock: vi.fn(),
}));

vi.mock('./userRoles', () => ({
  writeUserRoles: (uid: string, change: unknown) =>
    writeUserRolesMock(uid, change),
}));
vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: (uid: string) => ({ get: () => userGetMock(uid) }) }),
  },
}));

import {
  changeUserRoles,
  planMembershipChanges,
  planUserRolesChange,
  setUserMemberships,
  UserNotMigratedError,
} from './changeUserRoles';
import type { UserRolesChange } from './userRoles';

beforeEach(() => {
  vi.clearAllMocks();
  writeUserRolesMock.mockImplementation(async () => ({}));
});

describe('planUserRolesChange', () => {
  it('reicht die Änderung eines migrierten Benutzers unverändert durch', () => {
    const change = { kind: 'addMember', groupId: 'b' } as const;
    expect(planUserRolesChange({ groupRoles: { ffnd: [] } }, change)).toBe(
      change,
    );
  });

  it('setzt einen nicht migrierten Benutzer erst auf seine alten Felder auf', () => {
    // Sonst bliebe nach `groupRoles.b` nur die Gruppe b übrig und der Benutzer
    // verlöre ffnd samt Gruppen-Admin — die Migration überspränge ihn danach.
    expect(
      planUserRolesChange(
        { groups: ['allUsers', 'ffnd'], groupAdmin: ['ffnd'] },
        { kind: 'addMember', groupId: 'b' },
      ),
    ).toEqual({
      kind: 'replaceAll',
      groupRoles: { ffnd: ['gruppenadmin'], b: [] },
    });
  });

  it('ersetzt bei setGroupRoles die Rollen der Gruppe auf der alten Basis', () => {
    expect(
      planUserRolesChange(
        { groups: ['ffnd', 'b'], fahrtenbuchGeraetemeister: ['b'] },
        { kind: 'setGroupRoles', groupId: 'ffnd', roles: ['bekleidungswart'] },
      ),
    ).toEqual({
      kind: 'replaceAll',
      groupRoles: { ffnd: ['bekleidungswart'], b: ['geraetemeister'] },
    });
  });

  it('nimmt beim Austritt die Gruppe samt Rollen heraus', () => {
    expect(
      planUserRolesChange(
        { groups: ['ffnd', 'b'], groupAdmin: ['b'] },
        { kind: 'removeMember', groupId: 'b' },
      ),
    ).toEqual({ kind: 'replaceAll', groupRoles: { ffnd: [] } });
  });

  it('rechnet toggleRole eines nicht migrierten Benutzers um', () => {
    expect(
      planUserRolesChange(
        { groups: ['ffnd', 'b'], groupAdmin: ['b'] },
        { kind: 'toggleRole', groupId: 'ffnd', role: 'bekleidungswart', enabled: true },
      ),
    ).toEqual({
      kind: 'replaceAll',
      groupRoles: { ffnd: ['bekleidungswart'], b: ['gruppenadmin'] },
    });
  });

  it.each<UserRolesChange>([
    { kind: 'addMember', groupId: 'c' },
    { kind: 'removeMember', groupId: 'b' },
    { kind: 'setGroupRoles', groupId: 'ffnd', roles: [] },
    { kind: 'toggleRole', groupId: 'ffnd', role: 'kostenersatz', enabled: false },
  ])(
    'lehnt $kind an einem nicht migrierten Benutzer mit altem Kostenersatz ab',
    (change) => {
      expect(() =>
        planUserRolesChange({ groups: ['ffnd', 'b', 'kostenersatz'] }, change),
      ).toThrow(UserNotMigratedError);
    },
  );

  it('lässt einen migrierten Benutzer trotz altem Kostenersatz in groups durch', () => {
    // Zwischen Schritt 2 und 3 steht 'kostenersatz' noch in groups; die
    // Auswahl ist da schon in groupRoles angekommen.
    const change = { kind: 'removeMember', groupId: 'b' } as const;
    expect(
      planUserRolesChange(
        { groups: ['ffnd', 'b', 'kostenersatz'], groupRoles: { ffnd: [], b: [] } },
        change,
      ),
    ).toBe(change);
  });

  it('lehnt Rollen in einer Gruppe ohne Mitgliedschaft ab', () => {
    expect(() =>
      planUserRolesChange(
        { groups: ['ffnd'] },
        { kind: 'setGroupRoles', groupId: 'b', roles: ['kostenersatz'] },
      ),
    ).toThrow(/not a member/);
  });
});

describe('planMembershipChanges', () => {
  it('ergänzt und entfernt Gruppen eines migrierten Benutzers einzeln', () => {
    expect(
      planMembershipChanges(
        { groupRoles: { ffnd: ['geraetemeister'], b: [] } },
        ['ffnd', 'c'],
      ),
    ).toEqual([
      { kind: 'removeMember', groupId: 'b' },
      { kind: 'addMember', groupId: 'c' },
    ]);
  });

  it('ändert nichts, wenn die Mitgliedschaft gleich bleibt', () => {
    expect(
      planMembershipChanges({ groupRoles: { ffnd: [] } }, ['ffnd']),
    ).toEqual([]);
    // Auch ein nicht migrierter Benutzer wird dabei nicht nebenbei migriert.
    expect(
      planMembershipChanges({ groups: ['allUsers', 'ffnd'] }, ['ffnd']),
    ).toEqual([]);
  });

  it('ignoriert Nicht-Mandanten in der Auswahl', () => {
    expect(
      planMembershipChanges({ groupRoles: { ffnd: [] } }, [
        'ffnd',
        'allUsers',
        'kostenersatz',
      ]),
    ).toEqual([]);
  });

  it('schreibt einen nicht migrierten Benutzer in einem Zug neu', () => {
    expect(
      planMembershipChanges(
        { groups: ['ffnd', 'allUsers'], groupAdmin: ['ffnd'] },
        ['ffnd', 'c'],
      ),
    ).toEqual([
      {
        kind: 'replaceAll',
        groupRoles: { ffnd: ['gruppenadmin'], c: [] },
      },
    ]);
  });

  it('lehnt einen nicht migrierten Benutzer mit altem Kostenersatz ab', () => {
    // Die Umrechnung gäbe ihm Kostenersatz in jeder Gruppe und machte ihn zu
    // „migriert" — die Auswahl je Gruppe in Schritt 2 griffe nicht mehr.
    expect(() =>
      planMembershipChanges(
        { groups: ['ffnd', 'kostenersatz'], groupAdmin: ['ffnd'] },
        ['ffnd', 'c'],
      ),
    ).toThrow(UserNotMigratedError);
    // Ohne Änderung gibt es nichts abzulehnen.
    expect(
      planMembershipChanges({ groups: ['ffnd', 'kostenersatz'] }, ['ffnd']),
    ).toEqual([]);
  });
});

describe('changeUserRoles', () => {
  it('liest das Benutzerdokument und schreibt über writeUserRoles', async () => {
    userGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ groups: ['ffnd'] }),
    });

    await changeUserRoles('u1', { kind: 'addMember', groupId: 'b' });

    expect(writeUserRolesMock).toHaveBeenCalledWith('u1', {
      kind: 'replaceAll',
      groupRoles: { ffnd: [], b: [] },
    });
  });

  it('nimmt ein übergebenes Dokument, ohne es neu zu lesen', async () => {
    await changeUserRoles(
      'u1',
      { kind: 'removeMember', groupId: 'ffnd' },
      { groupRoles: { ffnd: [] } },
    );

    expect(userGetMock).not.toHaveBeenCalled();
    expect(writeUserRolesMock).toHaveBeenCalledWith('u1', {
      kind: 'removeMember',
      groupId: 'ffnd',
    });
  });

  it('scheitert an einem unbekannten Benutzer', async () => {
    userGetMock.mockResolvedValue({ exists: false, data: () => undefined });

    await expect(
      changeUserRoles('u1', { kind: 'addMember', groupId: 'b' }),
    ).rejects.toThrow(/does not exist/);
    expect(writeUserRolesMock).not.toHaveBeenCalled();
  });
});

describe('setUserMemberships', () => {
  it('führt jede geplante Änderung aus und liefert das Ergebnis', async () => {
    writeUserRolesMock
      .mockResolvedValueOnce({ ffnd: [] })
      .mockResolvedValueOnce({ ffnd: [], c: [] });

    const result = await setUserMemberships('u1', ['ffnd', 'c'], {
      groupRoles: { ffnd: [], b: [] },
    });

    expect(writeUserRolesMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ffnd: [], c: [] });
  });

  it('liefert ohne Änderung die bestehenden Rollen', async () => {
    const result = await setUserMemberships('u1', ['ffnd'], {
      groupRoles: { ffnd: ['kostenersatz'] },
    });

    expect(writeUserRolesMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ffnd: ['kostenersatz'] });
  });
});
