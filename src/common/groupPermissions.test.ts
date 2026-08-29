import { describe, expect, it } from 'vitest';
import { hasAnyGroupAdminRole, isGroupAdmin } from './groupPermissions';

describe('isGroupAdmin', () => {
  it('lässt den globalen Admin ohne Mitgliedschaft durch', () => {
    expect(isGroupAdmin('ffnd', { isAdmin: true })).toBe(true);
  });

  it('lässt den Gruppen-Admin mit Mitgliedschaft durch', () => {
    expect(
      isGroupAdmin('ffnd', { groups: ['ffnd'], groupAdmin: ['ffnd'] }),
    ).toBe(true);
  });

  it('verlangt vom Gruppen-Admin die Mitgliedschaft', () => {
    expect(isGroupAdmin('ffnd', { groups: [], groupAdmin: ['ffnd'] })).toBe(
      false,
    );
  });

  it('gilt nicht für eine andere Gruppe', () => {
    expect(
      isGroupAdmin('ffxy', { groups: ['ffnd', 'ffxy'], groupAdmin: ['ffnd'] }),
    ).toBe(false);
  });

  it('ist false ohne jede Rolle', () => {
    expect(isGroupAdmin('ffnd', { groups: ['ffnd'] })).toBe(false);
    expect(isGroupAdmin('ffnd', {})).toBe(false);
  });

  it('ist false für eine leere Gruppen-ID', () => {
    expect(isGroupAdmin('', { groups: [''], groupAdmin: [''] })).toBe(false);
  });
});

describe('hasAnyGroupAdminRole', () => {
  it('ist true für den globalen Admin', () => {
    expect(hasAnyGroupAdminRole({ isAdmin: true })).toBe(true);
  });

  it('ist true für einen eingetragenen Gruppen-Admin', () => {
    expect(hasAnyGroupAdminRole({ groupAdmin: ['ffnd'] })).toBe(true);
  });

  it('ist false ohne Rolle', () => {
    expect(hasAnyGroupAdminRole({ groupAdmin: [] })).toBe(false);
    expect(hasAnyGroupAdminRole({})).toBe(false);
  });
});
