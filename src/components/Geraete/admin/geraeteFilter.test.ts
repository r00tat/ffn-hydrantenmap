import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import {
  DEFAULT_GERAETE_FILTER,
  filterGeraete,
  klasse1Options,
  lagerortOptions,
  reorderList,
  type GeraeteFilter,
} from './geraeteFilter';

function geraet(over: Partial<Geraet>): Geraet {
  return {
    id: 'g',
    bezeichnung: 'Artikel',
    verbrauchsmaterial: false,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function bestand(over: Partial<GeraetBestand>): GeraetBestand {
  return {
    id: 'b',
    geraetId: 'g',
    lagerortKey: 'fahrzeug|srf|gr 2',
    lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
    anzahl: 1,
    ...over,
  };
}

const vlies = geraet({
  id: 'vlies',
  bezeichnung: 'Bindevlies Economy',
  klasse1: 'Schadstoff',
  verbrauchsmaterial: true,
  mindestbestand: 10,
  bestandGesamt: 4,
  nachbestellenSeit: '2026-10-01T10:00:00.000Z',
  inventarNr: 'INV-100',
});
const schere = geraet({
  id: 'schere',
  bezeichnung: 'Rettungsschere',
  klasse1: 'Technik',
  barcodes: ['4000123'],
  seriennummer: 'SN-77',
});
const filter = geraet({
  id: 'filter',
  bezeichnung: 'Filter A2B2',
  klasse1: 'Schadstoff',
  verbrauchsmaterial: true,
  mindestbestand: 5,
  bestandGesamt: 8,
});
const alt = geraet({ id: 'alt', bezeichnung: 'Alter Spreizer', active: false });

const all = [vlies, schere, filter, alt];

const bestaendeByGeraet = new Map<string, GeraetBestand[]>([
  ['vlies', [bestand({ id: 'b1', geraetId: 'vlies' })]],
  [
    'filter',
    [
      bestand({
        id: 'b2',
        geraetId: 'filter',
        lagerortKey: 'raum|feuerwehrhaus|lager',
        lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
      }),
    ],
  ],
]);

function run(over: Partial<GeraeteFilter>) {
  return filterGeraete(all, bestaendeByGeraet, {
    ...DEFAULT_GERAETE_FILTER,
    ...over,
  }).map((g) => g.id);
}

describe('filterGeraete', () => {
  it('blendet inaktive Artikel standardmäßig aus', () => {
    expect(run({})).toEqual(['vlies', 'schere', 'filter']);
    expect(run({ showInactive: true })).toContain('alt');
  });

  it('sucht in Bezeichnung, Inventar-Nr., Barcode und Seriennummer', () => {
    expect(run({ search: 'binde' })).toEqual(['vlies']);
    expect(run({ search: 'inv-100' })).toEqual(['vlies']);
    expect(run({ search: '4000123' })).toEqual(['schere']);
    expect(run({ search: 'sn-77' })).toEqual(['schere']);
  });

  it('verlangt jedes Suchwort', () => {
    expect(run({ search: 'filter a2b2' })).toEqual(['filter']);
    expect(run({ search: 'filter schere' })).toEqual([]);
  });

  it('filtert nach Klasse 1', () => {
    expect(run({ klasse1: 'Schadstoff' })).toEqual(['vlies', 'filter']);
  });

  it('filtert nach Lagerort', () => {
    expect(run({ lagerortKey: 'raum|feuerwehrhaus|lager' })).toEqual(['filter']);
  });

  it('filtert nach Verbrauchsmaterial', () => {
    expect(run({ onlyConsumable: true })).toEqual(['vlies', 'filter']);
  });

  it('filtert nach „unter Mindestbestand"', () => {
    expect(run({ onlyBelowMinimum: true })).toEqual(['vlies']);
  });
});

describe('klasse1Options', () => {
  it('liefert die vorhandenen Klassen sortiert und ohne Dubletten', () => {
    expect(klasse1Options(all)).toEqual(['Schadstoff', 'Technik']);
  });
});

describe('lagerortOptions', () => {
  it('liefert je lagerortKey einen Eintrag mit lesbarer Bezeichnung', () => {
    const options = lagerortOptions([
      bestand({ id: 'x1' }),
      bestand({ id: 'x2' }),
      bestand({
        id: 'x3',
        lagerortKey: 'raum|feuerwehrhaus|lager',
        lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
      }),
    ]);
    expect(options).toEqual([
      { key: 'raum|feuerwehrhaus|lager', label: 'Feuerwehrhaus · Lager' },
      { key: 'fahrzeug|srf|gr 2', label: 'SRF · GR 2' },
    ]);
  });
});

describe('reorderList', () => {
  it('enthält aktive Artikel mit nachbestellenSeit oder unter dem Mindestbestand', () => {
    const ohneMarke = geraet({
      id: 'ohneMarke',
      bezeichnung: 'Ölbinder',
      verbrauchsmaterial: true,
      mindestbestand: 3,
      bestandGesamt: 1,
    });
    const inaktiv = geraet({
      id: 'inaktiv',
      mindestbestand: 3,
      bestandGesamt: 0,
      active: false,
    });
    expect(reorderList([...all, ohneMarke, inaktiv]).map((g) => g.id)).toEqual([
      'vlies',
      'ohneMarke',
    ]);
  });
});
