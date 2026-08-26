import { describe, expect, it } from 'vitest';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { SHARE_ACTOR_PREFIX } from '../../common/fahrtenbuchShare';
import {
  canModifyEntry,
  isEntryDriver,
  isShareLinkEntry,
  wasEntryEdited,
} from './entryPermissions';

const own = { createdBy: 'u1' } as FahrtenbuchEntry;
const foreign = { createdBy: 'u2' } as FahrtenbuchEntry;

/** Eine Fahrt hinter dem QR-Code: kein Benutzer, nur die Link-ID. */
const shared = {
  createdBy: `${SHARE_ACTOR_PREFIX}0516d6a8494d`,
  createdByName: 'Adrian Schennet',
  driverId: 'p1',
  driverName: 'Adrian Schennet',
} as FahrtenbuchEntry;

describe('isShareLinkEntry', () => {
  it('erkennt einen über den Freigabe-Link erfassten Eintrag', () => {
    expect(isShareLinkEntry(shared)).toBe(true);
  });

  it('erkennt einen angemeldet erfassten Eintrag nicht als solchen', () => {
    expect(isShareLinkEntry(own)).toBe(false);
  });

  it('verträgt einen Eintrag ohne Ersteller', () => {
    expect(isShareLinkEntry({} as FahrtenbuchEntry)).toBe(false);
  });
});

describe('isEntryDriver', () => {
  it('trifft über die verknüpfte Person', () => {
    expect(isEntryDriver(shared, { userId: 'u9', personIds: ['p1'] })).toBe(
      true,
    );
  });

  it('trifft nicht über eine andere verknüpfte Person', () => {
    expect(isEntryDriver(shared, { userId: 'u9', personIds: ['p2'] })).toBe(
      false,
    );
  });

  it('trifft nicht ohne verknüpfte Person', () => {
    // Die Verknüpfung ist die einzige Zuordnung — ohne sie bleibt die Fahrt
    // dem Gerätemeister vorbehalten.
    expect(isEntryDriver(shared, { userId: 'u9' })).toBe(false);
  });

  it('trifft nicht über den Anzeigenamen des Aufrufers', () => {
    // Die Firebase-`displayName` gehört dem Benutzer selbst: aus einem
    // Freitextfeld der Selbstregistrierung und danach über `updateProfile`
    // jederzeit änderbar. Wer sich auf den Namen einer Kollegin umbenennt,
    // dürfte sonst deren QR-Fahrten ändern und löschen.
    expect(
      isEntryDriver(shared, {
        userId: 'u9',
        ...({ userName: 'Adrian Schennet' } as object),
      }),
    ).toBe(false);
  });

  it('trifft nicht bei einem Eintrag ohne driverId', () => {
    // Sonst machte ein Eintrag ohne Fahrer jeden Aufrufer ohne Verknüpfung zum
    // Fahrer.
    expect(
      isEntryDriver({} as FahrtenbuchEntry, { userId: 'u9', personIds: [] }),
    ).toBe(false);
  });
});

describe('canModifyEntry', () => {
  it('erlaubt dem Ersteller', () => {
    expect(canModifyEntry(own, { userId: 'u1' }, false)).toBe(true);
  });

  it('erlaubt einem Verwalter der Gruppe', () => {
    expect(canModifyEntry(foreign, { userId: 'u1' }, true)).toBe(true);
  });

  it('verbietet allen anderen', () => {
    expect(canModifyEntry(foreign, { userId: 'u1' }, false)).toBe(false);
  });

  it('erlaubt dem verknüpften Fahrer einer über den QR-Code erfassten Fahrt', () => {
    expect(
      canModifyEntry(shared, { userId: 'u9', personIds: ['p1'] }, false),
    ).toBe(true);
  });

  it('verbietet einem fremden Mitglied die QR-Fahrt', () => {
    expect(
      canModifyEntry(shared, { userId: 'u9', personIds: ['p2'] }, false),
    ).toBe(false);
  });

  it('verbietet die QR-Fahrt ohne gepflegte Verknüpfung', () => {
    expect(canModifyEntry(shared, { userId: 'u9' }, false)).toBe(false);
  });

  it('macht den verknüpften Fahrer einer angemeldet erfassten Fahrt nicht zum Bearbeiter', () => {
    // Die Ausnahme gilt nur für Einträge ohne Ersteller. Bei einem echten
    // Ersteller bleibt es bei ihm — sonst dürfte der eingetragene Fahrer den
    // Eintrag eines Kollegen überschreiben.
    const byOther = {
      createdBy: 'u2',
      driverId: 'p1',
      driverName: 'Adrian Schennet',
    } as FahrtenbuchEntry;
    expect(
      canModifyEntry(byOther, { userId: 'u9', personIds: ['p1'] }, false),
    ).toBe(false);
  });

  it('verbietet ohne Benutzer-ID auch bei gleichem leeren Ersteller', () => {
    // Ein Eintrag ohne `createdBy` darf nicht durch einen Aufrufer ohne ID
    // aufgehen — beides `undefined` wäre sonst ein Treffer.
    expect(canModifyEntry({} as FahrtenbuchEntry, {}, false)).toBe(false);
  });
});

describe('wasEntryEdited', () => {
  it('erkennt eine Änderung nach dem Anlegen', () => {
    expect(
      wasEntryEdited({
        createdAt: '2026-08-24T15:29:48.600Z',
        updatedAt: '2026-08-24T16:02:11.000Z',
      } as FahrtenbuchEntry),
    ).toBe(true);
  });

  it('erkennt einen unveränderten Eintrag', () => {
    expect(
      wasEntryEdited({
        createdAt: '2026-08-24T15:29:48.600Z',
        updatedAt: '2026-08-24T15:29:48.600Z',
      } as FahrtenbuchEntry),
    ).toBe(false);
  });

  it('verträgt einen Eintrag ohne Zeitstempel', () => {
    expect(wasEntryEdited({} as FahrtenbuchEntry)).toBe(false);
  });
});
