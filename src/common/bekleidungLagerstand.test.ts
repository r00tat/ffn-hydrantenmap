import { describe, expect, it } from 'vitest';
import type {
  BekleidungArtikel,
  BekleidungAusgabe,
  BekleidungBestand,
  BekleidungStueck,
} from './bekleidung';
import { computeLagerstand } from './bekleidungLagerstand';

const stamps = {
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'test',
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test',
};

const artikel: BekleidungArtikel[] = [
  {
    ...stamps,
    id: 'jacke',
    kategorie: 'einsatz',
    bezeichnung: 'Jacke',
    fuehrung: 'einzeln',
    aktiv: true,
  },
  {
    ...stamps,
    id: 'polo',
    kategorie: 'dienst',
    bezeichnung: 'Polo',
    fuehrung: 'menge',
    aktiv: true,
  },
];

function stueck(
  id: string,
  groesse: string,
  status: BekleidungStueck['status'],
  eigentum: BekleidungStueck['eigentum'] = 'feuerwehr',
): BekleidungStueck {
  return {
    ...stamps,
    id,
    artikelId: 'jacke',
    groesse,
    status,
    eigentum,
    waschgaenge: 0,
    waschgaengeAltbestand: 0,
  };
}

function ausgabe(
  id: string,
  groesse: string,
  menge: number,
  extra: Partial<BekleidungAusgabe> = {},
): BekleidungAusgabe {
  return {
    ...stamps,
    id,
    personId: 'p1',
    artikelId: 'polo',
    groesse,
    menge,
    quelle: 'app',
    ...extra,
  };
}

describe('computeLagerstand', () => {
  it('zählt Einzelstücke der Feuerwehr, private nicht', () => {
    const rows = computeLagerstand(
      artikel,
      [
        stueck('s1', 'M', 'lager'),
        stueck('s2', ' m ', 'lager'),
        stueck('s3', 'M', 'ausgegeben'),
        stueck('s4', 'M', 'lager', 'privat'),
        stueck('s5', 'M', 'ausgegeben', 'privat'),
        stueck('s6', 'M', 'ausgeschieden'),
      ],
      [],
      [],
    );
    expect(rows).toEqual([{ artikelId: 'jacke', groesse: 'M', imLager: 2, ausgegeben: 1 }]);
  });

  it('zählt Mengenbestand und offene Mengen-Ausgaben, geschlossene nicht', () => {
    const bestand: BekleidungBestand[] = [
      { artikelId: 'polo', groesse: 'L', anzahl: 4, updatedAt: '', updatedBy: '' },
    ];
    const rows = computeLagerstand(artikel, [], bestand, [
      ausgabe('a1', 'L', 2),
      ausgabe('a2', 'l', 1),
      ausgabe('a3', 'L', 5, { zurueckAm: '2026-02-01' }),
      ausgabe('a4', 'XL', 1),
      // Ausgabe eines Einzelstücks zählt nicht als Menge
      ausgabe('a5', 'L', 1, { stueckId: 's1' }),
    ]);
    expect(rows).toEqual([
      { artikelId: 'polo', groesse: 'L', imLager: 4, ausgegeben: 3 },
      { artikelId: 'polo', groesse: 'XL', imLager: 0, ausgegeben: 1 },
    ]);
  });

  it('sortiert nach Bezeichnung und dann numerisch nach Größe', () => {
    const rows = computeLagerstand(
      artikel,
      [stueck('a', '10', 'lager'), stueck('b', '9', 'lager')],
      [{ artikelId: 'polo', groesse: 'S', anzahl: 1, updatedAt: '', updatedBy: '' }],
      [],
    );
    expect(rows.map((r) => `${r.artikelId}:${r.groesse}`)).toEqual([
      'jacke:9',
      'jacke:10',
      'polo:S',
    ]);
  });

  it('private Mengen-Ausgaben zählen nicht als ausgegeben', () => {
    const rows = computeLagerstand(
      artikel,
      [],
      [],
      [ausgabe('a1', 'L', 2), ausgabe('a2', 'L', 1, { eigentum: 'privat' })],
    );
    expect(rows).toEqual([{ artikelId: 'polo', groesse: 'L', imLager: 0, ausgegeben: 2 }]);
  });

  it('teilt nach Chargen auf, sobald eine Charge vorkommt', () => {
    const bestand: BekleidungBestand[] = [
      { artikelId: 'polo', groesse: 'L', anzahl: 4, updatedAt: '', updatedBy: '' },
      { artikelId: 'polo', groesse: 'L', charge: 'Brand', anzahl: 2, updatedAt: '', updatedBy: '' },
    ];
    const rows = computeLagerstand(
      artikel,
      [{ ...stueck('s1', 'M', 'lager'), charge: 'Technisch' }],
      bestand,
      [ausgabe('a1', 'L', 1, { charge: 'brand' })],
    );
    expect(rows).toEqual([
      {
        artikelId: 'jacke',
        groesse: 'M',
        imLager: 1,
        ausgegeben: 0,
        chargen: [{ charge: 'Technisch', imLager: 1, ausgegeben: 0 }],
      },
      {
        artikelId: 'polo',
        groesse: 'L',
        imLager: 6,
        ausgegeben: 1,
        chargen: [
          { charge: 'Brand', imLager: 2, ausgegeben: 1 },
          { imLager: 4, ausgegeben: 0 },
        ],
      },
    ]);
  });
});
