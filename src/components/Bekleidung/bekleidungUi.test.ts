import { describe, expect, it } from 'vitest';
import type {
  BekleidungAusgabe,
  BekleidungStueck,
  BekleidungWaesche,
} from '../../common/bekleidung';
import {
  buildStueckTimeline,
  daysBetween,
  findStueckByCode,
  knownSizes,
  personItems,
  stueckLabel,
  todayLocalDate,
} from './bekleidungUi';

const stamps = { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };

function stueck(over: Partial<BekleidungStueck>): BekleidungStueck {
  return {
    id: 's1',
    artikelId: 'jacke',
    groesse: 'L',
    eigentum: 'feuerwehr',
    status: 'lager',
    waschgaenge: 0,
    waschgaengeAltbestand: 0,
    ...stamps,
    ...over,
  };
}

function ausgabe(over: Partial<BekleidungAusgabe>): BekleidungAusgabe {
  return {
    id: 'a1',
    personId: 'p1',
    artikelId: 'jacke',
    groesse: 'L',
    menge: 1,
    quelle: 'app',
    ...stamps,
    ...over,
  };
}

describe('bekleidungUi', () => {
  it('todayLocalDate formatiert das lokale Datum', () => {
    expect(todayLocalDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('daysBetween zählt Kalendertage', () => {
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetween('2026-03-29', '2026-03-30')).toBe(1);
  });

  it('findStueckByCode vergleicht normalisierte Tag-Nummern', () => {
    const list = [stueck({ id: 'a', tagNummer: '22081702' }), stueck({ id: 'b' })];
    expect(findStueckByCode(list, ' 22081702.0 ')?.id).toBe('a');
    expect(findStueckByCode(list, '999')).toBeUndefined();
    expect(findStueckByCode(list, '  ')).toBeUndefined();
  });

  it('stueckLabel nennt Artikel, Größe und Tag', () => {
    const artikel = new Map([
      ['jacke', { id: 'jacke', bezeichnung: 'Einsatzjacke' } as never],
    ]);
    expect(stueckLabel(stueck({ tagNummer: '1' }), artikel)).toBe('Einsatzjacke · L · #1');
    expect(stueckLabel(stueck({ artikelId: 'x' }), artikel)).toBe('x · L');
  });

  it('buildStueckTimeline sortiert neueste zuerst, ohne Datum zuletzt', () => {
    const waeschen: BekleidungWaesche[] = [
      { id: 'w1', datum: '2026-02-01', programm: 'standard', stueckIds: ['s1'], createdAt: '', createdBy: '' },
      { id: 'w2', datum: '2026-02-02', programm: 'standard', stueckIds: ['s2'], createdAt: '', createdBy: '' },
    ];
    const ausgaben = [
      ausgabe({ id: 'a1', stueckId: 's1', ausgegebenAm: '2026-01-01', zurueckAm: '2026-03-01' }),
      ausgabe({ id: 'a2', stueckId: 's1' }),
      ausgabe({ id: 'a3', stueckId: 's1', ausgegebenAm: '2026-04-01' }),
    ];
    const keys = buildStueckTimeline('s1', ausgaben, waeschen).map((e) => e.key);
    expect(keys).toEqual(['a-a3', 'w-w1', 'a-a1', 'a-a2']);
  });

  it('personItems trennt aktuelle und frühere Ausgaben', () => {
    const items = personItems('p1', [
      ausgabe({ id: 'open' }),
      ausgabe({ id: 'closed', zurueckAm: '2026-01-01' }),
      ausgabe({ id: 'other', personId: 'p2' }),
    ]);
    expect(items.current.map((a) => a.id)).toEqual(['open']);
    expect(items.history.map((a) => a.id)).toEqual(['closed']);
  });

  it('knownSizes sammelt Größen eines Artikels', () => {
    expect(
      knownSizes(
        'm',
        [{ artikelId: 'm', groesse: 'XL', anzahl: 1, updatedAt: '', updatedBy: '' }],
        [stueck({ artikelId: 'm', groesse: 'L' }), stueck({ artikelId: 'x', groesse: 'S' })],
      ),
    ).toEqual(['L', 'XL']);
  });
});
