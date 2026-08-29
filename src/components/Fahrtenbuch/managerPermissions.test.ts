import { describe, expect, it } from 'vitest';
import {
  hasAnyFahrtenbuchManagerRole,
  isFahrtenbuchManager,
} from './managerPermissions';

describe('isFahrtenbuchManager', () => {
  it('lässt einen Admin auch ohne Mitgliedschaft durch', () => {
    // Die Stammdaten-Actions verlangten unter actionAdminRequired() nie eine
    // Mitgliedschaft — das Recht darf ihm hier nicht genommen werden.
    expect(isFahrtenbuchManager('ffnd', { isAdmin: true })).toBe(true);
  });

  it('erkennt einen Gerätemeister seiner Gruppe', () => {
    expect(
      isFahrtenbuchManager('ffnd', {
        groups: ['ffnd', 'allUsers'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      }),
    ).toBe(true);
  });

  it('lehnt einen Gerätemeister ohne Mitgliedschaft ab', () => {
    // Wer aus der Gruppe fällt, verliert das Recht sofort — auch wenn der
    // Eintrag an seinem Benutzerdokument stehenbleibt.
    expect(
      isFahrtenbuchManager('ffnd', {
        groups: ['allUsers'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      }),
    ).toBe(false);
  });

  it('lehnt einen Gerätemeister einer anderen Gruppe ab', () => {
    expect(
      isFahrtenbuchManager('ffnd', {
        groups: ['ffnd', 'ffxy'],
        fahrtenbuchGeraetemeister: ['ffxy'],
      }),
    ).toBe(false);
  });

  it('lehnt ein einfaches Gruppenmitglied ab', () => {
    expect(isFahrtenbuchManager('ffnd', { groups: ['ffnd'] })).toBe(false);
  });

  it('kommt mit fehlenden Feldern zurecht', () => {
    expect(isFahrtenbuchManager('ffnd', {})).toBe(false);
  });
});

describe('hasAnyFahrtenbuchManagerRole', () => {
  it('gilt für jeden Admin', () => {
    expect(hasAnyFahrtenbuchManagerRole({ isAdmin: true })).toBe(true);
  });

  it('gilt für einen Gerätemeister mindestens einer Gruppe', () => {
    expect(
      hasAnyFahrtenbuchManagerRole({ fahrtenbuchGeraetemeister: ['ffnd'] }),
    ).toBe(true);
  });

  it('gilt nicht bei leerer Liste', () => {
    expect(hasAnyFahrtenbuchManagerRole({ fahrtenbuchGeraetemeister: [] })).toBe(
      false,
    );
  });

  it('gilt nicht ohne das Feld', () => {
    expect(hasAnyFahrtenbuchManagerRole({})).toBe(false);
  });
});

describe('Gruppen-Admin', () => {
  it('ist Fahrtenbuch-Manager seiner Gruppe', () => {
    expect(
      isFahrtenbuchManager('ffnd', {
        groups: ['ffnd'],
        groupAdmin: ['ffnd'],
      }),
    ).toBe(true);
  });

  it('ist es nicht in einer anderen Gruppe', () => {
    expect(
      isFahrtenbuchManager('ffxy', {
        groups: ['ffnd', 'ffxy'],
        groupAdmin: ['ffnd'],
      }),
    ).toBe(false);
  });

  it('braucht wie der Gerätemeister die Mitgliedschaft', () => {
    expect(
      isFahrtenbuchManager('ffnd', { groups: [], groupAdmin: ['ffnd'] }),
    ).toBe(false);
  });

  it('öffnet die Verwaltungsseite', () => {
    expect(hasAnyFahrtenbuchManagerRole({ groupAdmin: ['ffnd'] })).toBe(true);
  });
});
