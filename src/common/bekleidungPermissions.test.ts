import { describe, expect, it } from 'vitest';
import {
  hasAnyBekleidungRole,
  isBekleidungswart,
} from './bekleidungPermissions';

describe('isBekleidungswart', () => {
  it('lässt einen Admin auch ohne Mitgliedschaft durch', () => {
    expect(isBekleidungswart('ffnd', { isAdmin: true })).toBe(true);
  });

  it('lässt einen Gruppen-Admin mit Mitgliedschaft durch', () => {
    expect(
      isBekleidungswart('ffnd', { groups: ['ffnd'], groupAdmin: ['ffnd'] }),
    ).toBe(true);
  });

  it('erkennt einen Bekleidungswart seiner Gruppe', () => {
    expect(
      isBekleidungswart('ffnd', {
        groups: ['ffnd', 'allUsers'],
        bekleidungswart: ['ffnd'],
      }),
    ).toBe(true);
  });

  it('lehnt einen Bekleidungswart ohne Mitgliedschaft ab', () => {
    expect(
      isBekleidungswart('ffnd', {
        groups: ['allUsers'],
        bekleidungswart: ['ffnd'],
      }),
    ).toBe(false);
  });

  it('lehnt einen Bekleidungswart einer anderen Gruppe ab', () => {
    expect(
      isBekleidungswart('ffnd', {
        groups: ['ffnd', 'ffxy'],
        bekleidungswart: ['ffxy'],
      }),
    ).toBe(false);
  });

  it('lehnt ein einfaches Gruppenmitglied ab', () => {
    expect(isBekleidungswart('ffnd', { groups: ['ffnd'] })).toBe(false);
  });

  it('lehnt eine leere Gruppen-ID ab', () => {
    expect(
      isBekleidungswart('', { groups: [''], bekleidungswart: [''] }),
    ).toBe(false);
  });
});

describe('hasAnyBekleidungRole', () => {
  it('gilt für jeden Admin', () => {
    expect(hasAnyBekleidungRole({ isAdmin: true })).toBe(true);
  });

  it('gilt für einen Gruppen-Admin', () => {
    expect(hasAnyBekleidungRole({ groupAdmin: ['ffnd'] })).toBe(true);
  });

  it('gilt für einen Bekleidungswart mindestens einer Gruppe', () => {
    expect(hasAnyBekleidungRole({ bekleidungswart: ['ffnd'] })).toBe(true);
  });

  it('gilt nicht bei leerer Liste oder ohne Feld', () => {
    expect(hasAnyBekleidungRole({ bekleidungswart: [] })).toBe(false);
    expect(hasAnyBekleidungRole({})).toBe(false);
  });
});
