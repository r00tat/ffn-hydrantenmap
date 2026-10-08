import { describe, expect, it } from 'vitest';
import { matchPersonName, normalizePersonName } from './personNameMatch';

describe('normalizePersonName', () => {
  it('schreibt klein, fasst Leerzeichen zusammen, entfernt Punkte und behält Umlaute', () => {
    expect(normalizePersonName('  Max   MÜLLER-Mustermann ')).toBe('max müller-mustermann');
    expect(normalizePersonName('Erika M. Musterfrau')).toBe('erika m musterfrau');
  });
});

describe('matchPersonName', () => {
  const persons = [
    { id: 'p1', name: 'Max Mustermann' },
    { id: 'p2', name: 'Musterfrau Erika' },
    { id: 'p3', name: 'Hans Beispiel' },
  ];

  it('ordnet bei exakter Übereinstimmung in Reihenfolge Vorname Nachname zu', () => {
    expect(matchPersonName('Mustermann', 'Max', persons)).toEqual({
      status: 'matched',
      personId: 'p1',
      candidates: ['p1'],
    });
  });

  it('ordnet auch in Reihenfolge Nachname Vorname zu', () => {
    expect(matchPersonName('Musterfrau', 'Erika', persons)).toMatchObject({
      status: 'matched',
      personId: 'p2',
    });
    expect(
      matchPersonName('Mustermann', 'Max', [{ id: 'x', name: 'Mustermann Max' }]),
    ).toMatchObject({ status: 'matched', personId: 'x' });
  });

  it('ist unsicher bei ähnlicher Schreibweise', () => {
    expect(matchPersonName('Musterman', 'Max', persons)).toEqual({
      status: 'uncertain',
      candidates: ['p1'],
    });
  });

  it('ist neu ohne ähnliche Person', () => {
    expect(matchPersonName('Unbekannt', 'Otto', persons)).toEqual({
      status: 'new',
      candidates: [],
    });
  });

  it('ist unsicher bei zwei Personen gleichen Namens', () => {
    const result = matchPersonName('Mustermann', 'Max', [
      { id: 'a', name: 'Max Mustermann' },
      { id: 'b', name: 'Mustermann Max' },
    ]);
    expect(result.status).toBe('uncertain');
    expect(result.personId).toBeUndefined();
    expect(result.candidates.sort()).toEqual(['a', 'b']);
  });
});
