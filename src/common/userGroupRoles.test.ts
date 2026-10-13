import { describe, expect, it } from 'vitest';
import {
  claimGroupsForUser,
  effectiveGroupRoles,
  hasGroupRoles,
  userMemberGroupIds,
} from './userGroupRoles';

describe('hasGroupRoles', () => {
  it('erkennt migrierte Benutzer am Feld groupRoles, auch wenn es leer ist', () => {
    expect(hasGroupRoles({ groupRoles: {} })).toBe(true);
    expect(hasGroupRoles({ groupRoles: { ffnd: [] } })).toBe(true);
  });

  it('wertet fehlende oder kaputte groupRoles als nicht migriert', () => {
    expect(hasGroupRoles({ groups: ['ffnd'] })).toBe(false);
    expect(
      hasGroupRoles({ groupRoles: 'ffnd' as unknown as Record<string, []> }),
    ).toBe(false);
  });
});

describe('effectiveGroupRoles', () => {
  it('nimmt groupRoles, wenn vorhanden, und ignoriert die alten Felder', () => {
    expect(
      effectiveGroupRoles({
        groupRoles: { ffnd: ['geraetemeister'] },
        groups: ['ffnd', 'other'],
        groupAdmin: ['ffnd'],
      }),
    ).toEqual({ ffnd: ['geraetemeister'] });
  });

  it('rechnet nicht migrierte Benutzer aus den alten Feldern um', () => {
    expect(
      effectiveGroupRoles({
        groups: ['allUsers', 'ffnd', 'kostenersatz'],
        groupAdmin: ['ffnd'],
      }),
    ).toEqual({ ffnd: ['gruppenadmin', 'kostenersatz'] });
  });

  it('lässt Nicht-Mandanten auch in groupRoles weg', () => {
    expect(
      effectiveGroupRoles({ groupRoles: { allUsers: [], ffnd: [] } }),
    ).toEqual({ ffnd: [] });
  });
});

describe('userMemberGroupIds', () => {
  it('liefert die Mitgliedsgruppen aus groupRoles', () => {
    expect(
      userMemberGroupIds({ groupRoles: { ffnd: [], b: ['kostenersatz'] } }),
    ).toEqual(['ffnd', 'b']);
  });

  it('fällt für nicht migrierte Benutzer auf groups zurück', () => {
    expect(
      userMemberGroupIds({ groups: ['allUsers', 'ffnd', 'kostenersatz'] }),
    ).toEqual(['ffnd']);
  });
});

describe('claimGroupsForUser', () => {
  it('bildet den Claim eines migrierten Benutzers aus groupRoles plus allUsers', () => {
    expect(
      claimGroupsForUser({ groupRoles: { ffnd: [] }, groups: ['old'] }),
    ).toEqual(['ffnd', 'allUsers']);
  });

  it('behält kostenersatz im Claim, solange es in groups steht', () => {
    expect(
      claimGroupsForUser({
        groupRoles: { ffnd: ['kostenersatz'] },
        groups: ['ffnd', 'kostenersatz'],
      }),
    ).toEqual(['ffnd', 'allUsers', 'kostenersatz']);
  });

  it('lässt den Claim eines nicht migrierten Benutzers unverändert', () => {
    // Sonst nähme das bloße Freischalten in der Benutzerverwaltung einem
    // Benutzer vor der Migration alle Einsätze seiner Gruppen.
    expect(
      claimGroupsForUser({ groups: ['ffnd', 'kostenersatz'] }),
    ).toEqual(['ffnd', 'kostenersatz', 'allUsers']);
  });

  it('nimmt übergebene groupRoles statt des Dokuments', () => {
    expect(
      claimGroupsForUser({ groups: ['ffnd'] }, { other: [] }),
    ).toEqual(['other', 'allUsers']);
  });
});
