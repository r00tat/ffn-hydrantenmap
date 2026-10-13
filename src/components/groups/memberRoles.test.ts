import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  candidateRows,
  memberRows,
  withRole,
  type MemberSource,
} from './memberRoles';

const users: MemberSource[] = [
  {
    uid: 'u2',
    displayName: 'Zita Muster',
    email: 'z@example.org',
    groupRoles: { ffnd: ['kostenersatz'] },
  },
  {
    uid: 'u1',
    displayName: 'Anna Beispiel',
    email: 'a@example.org',
    groupRoles: { ffnd: [], other: ['gruppenadmin'] },
  },
  {
    uid: 'u3',
    email: 'legacy@example.org',
    groups: ['allUsers', 'ffnd'],
    groupAdmin: ['ffnd'],
  },
  { uid: 'u4', displayName: 'Nicht Mitglied', groupRoles: { other: [] } },
  {
    uid: 'g1',
    displayName: 'Gast',
    firecall: 'fc1',
    groups: ['allUsers', 'ffnd'],
  },
];

describe('memberRows', () => {
  it('listet die Mitglieder der Gruppe mit ihren Rollen, nach Namen sortiert', () => {
    expect(memberRows(users, 'ffnd')).toEqual([
      {
        uid: 'u1',
        displayName: 'Anna Beispiel',
        email: 'a@example.org',
        roles: [],
        migrated: true,
      },
      {
        uid: 'u3',
        displayName: 'legacy@example.org',
        email: 'legacy@example.org',
        roles: ['gruppenadmin'],
        migrated: false,
      },
      {
        uid: 'u2',
        displayName: 'Zita Muster',
        email: 'z@example.org',
        roles: ['kostenersatz'],
        migrated: true,
      },
    ]);
  });

  it('lässt Einsatz-Gäste weg, auch wenn sie die Gruppe im Claim tragen', () => {
    expect(memberRows(users, 'ffnd').map((row) => row.uid)).not.toContain('g1');
  });
});

describe('candidateRows', () => {
  it('bietet nur Nicht-Mitglieder ohne Gastzugang an', () => {
    expect(candidateRows(users, 'ffnd')).toEqual([
      { uid: 'u4', displayName: 'Nicht Mitglied', email: '' },
    ]);
  });
});

describe('withRole', () => {
  it('fügt eine Rolle sortiert und ohne Doppel hinzu', () => {
    expect(withRole(['kostenersatz'], 'geraetemeister', true)).toEqual([
      'geraetemeister',
      'kostenersatz',
    ]);
    expect(withRole(['kostenersatz'], 'kostenersatz', true)).toEqual([
      'kostenersatz',
    ]);
  });

  it('nimmt eine Rolle heraus', () => {
    expect(withRole(['geraetemeister', 'kostenersatz'], 'kostenersatz', false)).toEqual(
      ['geraetemeister'],
    );
  });
});

describe('assignableRoles', () => {
  it('gibt dem globalen Admin jede Rolle', () => {
    expect(assignableRoles({ isAdmin: true }, 'ffnd')).toEqual({
      gruppenadmin: true,
      geraetemeister: true,
      bekleidungswart: true,
      kostenersatz: true,
    });
  });

  it('lässt den Gruppen-Admin nur Rollen vergeben, deren Rechte er selbst hat', () => {
    expect(
      assignableRoles({ groupRoles: { ffnd: ['gruppenadmin'] } }, 'ffnd'),
    ).toEqual({
      gruppenadmin: false,
      geraetemeister: true,
      bekleidungswart: true,
      kostenersatz: false,
    });
  });

  it('gibt ohne rollen.assign nichts frei', () => {
    expect(
      Object.values(
        assignableRoles({ groupRoles: { ffnd: ['geraetemeister'] } }, 'ffnd'),
      ),
    ).toEqual([false, false, false, false]);
  });
});
