import { describe, expect, it } from 'vitest';
import {
  canOpenFahrtenbuchAdmin,
  fahrtenbuchAdminTabs,
  type AdminTabKey,
} from './adminTabs';

const ALL: AdminTabKey[] = [
  'vehicles',
  'settings',
  'shareLink',
  'pdfImport',
];

describe('fahrtenbuchAdminTabs', () => {
  it('zeigt dem globalen Admin alle Reiter, auch ohne Mitgliedschaft', () => {
    expect(fahrtenbuchAdminTabs({ isAdmin: true }, 'ffnd')).toEqual(ALL);
  });

  it('zeigt dem Gruppen-Admin alle Reiter seiner Gruppe', () => {
    expect(
      fahrtenbuchAdminTabs({ groupRoles: { ffnd: ['gruppenadmin'] } }, 'ffnd'),
    ).toEqual(ALL);
  });

  it('zeigt dem Gerätemeister die Fahrzeuge (Personen stehen unter /personal)', () => {
    expect(
      fahrtenbuchAdminTabs({ groupRoles: { ffnd: ['geraetemeister'] } }, 'ffnd'),
    ).toEqual(['vehicles']);
  });

  it('hängt an der gewählten Gruppe', () => {
    const user = {
      groupRoles: { ffnd: ['geraetemeister' as const], ffxy: [] },
    };
    expect(fahrtenbuchAdminTabs(user, 'ffxy')).toEqual([]);
  });

  it('zeigt einem Mitglied ohne Rolle nichts', () => {
    expect(fahrtenbuchAdminTabs({ groupRoles: { ffnd: [] } }, 'ffnd')).toEqual([]);
    expect(fahrtenbuchAdminTabs({ groupRoles: { ffnd: ['bekleidungswart'] } }, 'ffnd')).toEqual([]);
  });

  it('zeigt ohne Gruppe nichts', () => {
    expect(fahrtenbuchAdminTabs({ isAdmin: true }, undefined)).toEqual([]);
  });
});

describe('canOpenFahrtenbuchAdmin', () => {
  it('lässt durch, wer in irgendeiner Gruppe einen Reiter hat', () => {
    expect(canOpenFahrtenbuchAdmin({ isAdmin: true })).toBe(true);
    expect(
      canOpenFahrtenbuchAdmin({ groupRoles: { ffxy: ['geraetemeister'] } }),
    ).toBe(true);
    expect(
      canOpenFahrtenbuchAdmin({ groupRoles: { ffxy: ['gruppenadmin'] } }),
    ).toBe(true);
  });

  it('sperrt ein Mitglied ohne passende Rolle aus', () => {
    expect(canOpenFahrtenbuchAdmin({ groupRoles: { ffnd: [] } })).toBe(false);
    expect(
      canOpenFahrtenbuchAdmin({ groupRoles: { ffnd: ['kostenersatz'] } }),
    ).toBe(false);
    expect(canOpenFahrtenbuchAdmin({})).toBe(false);
  });
});
