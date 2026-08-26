import { describe, expect, it } from 'vitest';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import {
  matchPersonsToUsers,
  type PersonUserCandidate,
} from './personUserMatch';

function person(
  overrides: Partial<FahrtenbuchPerson> & Pick<FahrtenbuchPerson, 'id' | 'name'>,
): FahrtenbuchPerson {
  return {
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

function user(
  overrides: Partial<PersonUserCandidate> & Pick<PersonUserCandidate, 'uid'>,
): PersonUserCandidate {
  return { ...overrides };
}

describe('matchPersonsToUsers', () => {
  it('schlägt einen eindeutigen Namenstreffer vor', () => {
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet' })],
      [
        user({ uid: 'u1', displayName: 'Adrian Schennet' }),
        user({ uid: 'u2', displayName: 'Paul Wölfel' }),
      ],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      personId: 'p1',
      status: 'unique',
    });
    expect(matches[0].candidates.map((c) => c.uid)).toEqual(['u1']);
  });

  it('trifft auch bei umgekehrter Schreibweise des Namens', () => {
    // Aus BlaulichtSMS kommen Namen als „Nachname Vorname".
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet' })],
      [user({ uid: 'u1', displayName: 'Schennet Adrian' })],
    );

    expect(matches[0].status).toBe('unique');
  });

  it('meldet mehrere gleichnamige Konten als mehrdeutig', () => {
    // Der reale Fall: dieselbe Person hat sich zweimal registriert.
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet' })],
      [
        user({
          uid: 'u1',
          displayName: 'Adrian Schennet',
          email: 'adrian@example.at',
        }),
        user({
          uid: 'u2',
          displayName: 'Adrian Schennet',
          email: 'a.schennet@ff.at',
        }),
      ],
    );

    expect(matches[0].status).toBe('ambiguous');
    expect(matches[0].candidates.map((c) => c.uid)).toEqual(['u1', 'u2']);
  });

  it('löst die Mehrdeutigkeit über die gepflegte E-Mail auf', () => {
    const matches = matchPersonsToUsers(
      [
        person({
          id: 'p1',
          name: 'Adrian Schennet',
          email: 'A.Schennet@ff.at',
        }),
      ],
      [
        user({
          uid: 'u1',
          displayName: 'Adrian Schennet',
          email: 'adrian@example.at',
        }),
        user({
          uid: 'u2',
          displayName: 'Adrian Schennet',
          email: 'a.schennet@ff.at',
        }),
      ],
    );

    // Groß-/Kleinschreibung darf dabei keine Rolle spielen.
    expect(matches[0].status).toBe('unique');
    expect(matches[0].candidates.map((c) => c.uid)).toEqual(['u2']);
  });

  it('findet über die E-Mail auch ohne Namensgleichheit', () => {
    // Heirat, Tippfehler, Spitzname im Konto — die gepflegte E-Mail wiegt mehr.
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Angela Scharinger', email: 'angela@ff.at' })],
      [user({ uid: 'u1', displayName: 'Angi S.', email: 'angela@ff.at' })],
    );

    expect(matches[0].status).toBe('unique');
    expect(matches[0].candidates.map((c) => c.uid)).toEqual(['u1']);
  });

  it('meldet ohne Treffer keinen Vorschlag', () => {
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet' })],
      [user({ uid: 'u1', displayName: 'Paul Wölfel' })],
    );

    expect(matches[0].status).toBe('none');
    expect(matches[0].candidates).toEqual([]);
  });

  it('lässt schon verknüpfte Personen als solche erkennen', () => {
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet', userIds: ['u1'] })],
      [user({ uid: 'u1', displayName: 'Adrian Schennet' })],
    );

    expect(matches[0].status).toBe('linked');
    expect(matches[0].linkedUserIds).toEqual(['u1']);
  });

  it('schlägt für eine teilweise verknüpfte Person die fehlenden Konten vor', () => {
    // Zweitregistrierung, die nach der ersten Zuordnung dazukam.
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet', userIds: ['u1'] })],
      [
        user({ uid: 'u1', displayName: 'Adrian Schennet' }),
        user({ uid: 'u2', displayName: 'Adrian Schennet' }),
      ],
    );

    expect(matches[0].status).toBe('ambiguous');
    expect(matches[0].linkedUserIds).toEqual(['u1']);
    expect(matches[0].candidates.map((c) => c.uid)).toEqual(['u2']);
  });

  it('vergibt ein Konto nicht an zwei Personen', () => {
    // Zwei echte Menschen mit demselben Namen: Ein Konto kann nur einem
    // gehören, und welchem, kann nur ein Mensch entscheiden.
    const matches = matchPersonsToUsers(
      [
        person({ id: 'p1', name: 'Josef Haider' }),
        person({ id: 'p2', name: 'Josef Haider' }),
      ],
      [user({ uid: 'u1', displayName: 'Josef Haider' })],
    );

    expect(matches.map((m) => m.status)).toEqual(['ambiguous', 'ambiguous']);
    expect(matches[0].contestedBy).toEqual(['p2']);
    expect(matches[1].contestedBy).toEqual(['p1']);
  });

  it('überspringt Personen ohne ID', () => {
    const matches = matchPersonsToUsers(
      [person({ id: undefined as never, name: 'Adrian Schennet' })],
      [user({ uid: 'u1', displayName: 'Adrian Schennet' })],
    );

    expect(matches).toEqual([]);
  });

  it('ignoriert Konten ohne Namen und ohne E-Mail', () => {
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet' })],
      [user({ uid: 'u1' }), user({ uid: 'u2', displayName: '' })],
    );

    expect(matches[0].status).toBe('none');
  });

  it('führt Konten mit ihren Merkmalen für die Anzeige', () => {
    // Der Admin soll ein gesperrtes oder gruppenfremdes Konto erkennen, statt
    // es blind zu bestätigen — ausgeblendet wird es aber nicht.
    const matches = matchPersonsToUsers(
      [person({ id: 'p1', name: 'Adrian Schennet' })],
      [
        user({
          uid: 'u1',
          displayName: 'Adrian Schennet',
          email: 'a@ff.at',
          disabled: true,
          isAuthorized: false,
          inGroup: false,
        }),
      ],
    );

    expect(matches[0].candidates[0]).toMatchObject({
      uid: 'u1',
      email: 'a@ff.at',
      disabled: true,
      isAuthorized: false,
      inGroup: false,
    });
  });

  it('sortiert nach Handlungsbedarf: mehrdeutig, eindeutig, ohne, verknüpft', () => {
    const matches = matchPersonsToUsers(
      [
        person({ id: 'p1', name: 'Kein Konto' }),
        person({ id: 'p2', name: 'Schon Da', userIds: ['u9'] }),
        person({ id: 'p3', name: 'Eindeutig Klar' }),
        person({ id: 'p4', name: 'Doppelt Vorhanden' }),
      ],
      [
        user({ uid: 'u3', displayName: 'Eindeutig Klar' }),
        user({ uid: 'u4', displayName: 'Doppelt Vorhanden', email: 'a@x.at' }),
        user({ uid: 'u5', displayName: 'Doppelt Vorhanden', email: 'b@x.at' }),
      ],
    );

    expect(matches.map((m) => m.personId)).toEqual(['p4', 'p3', 'p1', 'p2']);
  });
});
