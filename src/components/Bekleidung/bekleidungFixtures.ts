/**
 * Testdaten der Bekleidungsoberfläche. Nur Musternamen.
 */

import type {
  BekleidungArtikel,
  BekleidungAusgabe,
  BekleidungBestand,
  BekleidungStueck,
  BekleidungWaesche,
} from '../../common/bekleidung';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import { buildBekleidungView, type BekleidungData, type BekleidungView } from './bekleidungUi';

const stamps = { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };

export function makeArtikel(over: Partial<BekleidungArtikel>): BekleidungArtikel {
  return {
    id: 'jacke',
    kategorie: 'einsatz',
    bezeichnung: 'Einsatzjacke',
    fuehrung: 'einzeln',
    aktiv: true,
    ...stamps,
    ...over,
  };
}

export function makeStueck(over: Partial<BekleidungStueck>): BekleidungStueck {
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

export function makeAusgabe(over: Partial<BekleidungAusgabe>): BekleidungAusgabe {
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

export const jacke = makeArtikel({ maxWaschgaenge: 10 });
export const polo = makeArtikel({
  id: 'polo',
  kategorie: 'dienst',
  bezeichnung: 'Poloshirt',
  fuehrung: 'menge',
});

export const persons: FahrtenbuchPerson[] = [
  { ...stamps, id: 'p1', name: 'Max Mustermann', active: true },
  { ...stamps, id: 'p2', name: 'Erika Musterfrau', active: true },
  { ...stamps, id: 'p3', name: 'Erika Mustermann', active: false },
];

export function sampleData(over: Partial<BekleidungData> = {}): BekleidungData {
  const stuecke: BekleidungStueck[] = [
    makeStueck({ id: 's1', tagNummer: '1001', waschgaenge: 8, waschgaengeAltbestand: 1 }),
    makeStueck({
      id: 's2',
      tagNummer: '1002',
      groesse: 'M',
      status: 'ausgegeben',
      personId: 'p1',
      ausgabeId: 'a1',
      ausgegebenAm: '2026-01-10',
    }),
    makeStueck({ id: 's3', tagNummer: '1003', eigentum: 'privat', groesse: 'XL' }),
  ];
  const bestand: BekleidungBestand[] = [
    { id: 'polo__M', artikelId: 'polo', groesse: 'M', anzahl: 5, updatedAt: '', updatedBy: '' },
  ];
  const ausgaben: BekleidungAusgabe[] = [
    makeAusgabe({ id: 'a1', stueckId: 's2', groesse: 'M', ausgegebenAm: '2026-01-10' }),
    makeAusgabe({ id: 'a2', artikelId: 'polo', groesse: 'M', menge: 2 }),
    makeAusgabe({
      id: 'a3',
      stueckId: 's1',
      ausgegebenAm: '2025-01-01',
      zurueckAm: '2025-03-02',
    }),
  ];
  const waeschen: BekleidungWaesche[] = [
    {
      id: 'w1',
      datum: '2026-02-01',
      programm: 'impraegnierung',
      stueckIds: ['s1'],
      createdAt: '',
      createdBy: '',
    },
  ];
  return {
    groupId: 'ffnd',
    artikel: [jacke, polo],
    stuecke,
    bestand,
    ausgaben,
    waeschen,
    persons,
    ...over,
  };
}

export function sampleView(over: Partial<BekleidungData> = {}): BekleidungView {
  return buildBekleidungView(sampleData(over));
}
