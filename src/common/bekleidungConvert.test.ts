import { describe, expect, it } from 'vitest';
import type { BekleidungAusgabe, BekleidungStueck } from './bekleidung';
import { planConversionToMenge } from './bekleidungConvert';

const stamps = { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };

function stueck(over: Partial<BekleidungStueck>): BekleidungStueck {
  return {
    ...stamps,
    id: 's',
    artikelId: 'bluse',
    groesse: '40',
    eigentum: 'feuerwehr',
    status: 'lager',
    waschgaenge: 0,
    waschgaengeAltbestand: 3,
    ...over,
  };
}

function ausgabe(over: Partial<BekleidungAusgabe>): BekleidungAusgabe {
  return {
    ...stamps,
    id: 'a',
    personId: 'p1',
    artikelId: 'bluse',
    groesse: '40',
    menge: 1,
    quelle: 'import',
    ...over,
  };
}

describe('planConversionToMenge', () => {
  it('macht Lagerstücke der Feuerwehr zu Bestand je Größe und Charge', () => {
    const plan = planConversionToMenge(
      [
        stueck({ id: 's1' }),
        stueck({ id: 's2', groesse: ' 40 ' }),
        stueck({ id: 's3', charge: 'Brand' }),
        stueck({ id: 's4', eigentum: 'privat' }),
        stueck({ id: 's5', status: 'ausgeschieden' }),
        stueck({ id: 's6', status: 'ausgegeben', ausgabeId: 'a6', personId: 'p1' }),
        // ausgegeben ohne Ausgabe (Import ohne Person): lässt sich nicht abbilden
        stueck({ id: 's7', status: 'ausgegeben' }),
      ],
      [
        ausgabe({ id: 'a6', stueckId: 's6' }),
        ausgabe({ id: 'a9', stueckId: 's4', zurueckAm: '2025-01-01' }),
      ],
    );
    expect(plan.bestand).toEqual([
      { groesse: '40', anzahl: 2 },
      { groesse: '40', charge: 'Brand', anzahl: 1 },
    ]);
    expect(plan.ausgaben).toEqual([
      { id: 'a6', charge: undefined, privat: false },
      { id: 'a9', charge: undefined, privat: true },
    ]);
    expect(plan.dropped).toEqual({ privat: 1, ausgeschieden: 1, ohnePerson: 1 });
  });

  it('nimmt die Charge des Stücks an die Ausgabe mit', () => {
    const plan = planConversionToMenge(
      [stueck({ id: 's1', status: 'ausgegeben', charge: 'KS03', ausgabeId: 'a1' })],
      [ausgabe({ id: 'a1', stueckId: 's1' })],
    );
    expect(plan.ausgaben).toEqual([{ id: 'a1', charge: 'KS03', privat: false }]);
    expect(plan.bestand).toEqual([]);
  });

  it('meldet erfasste Wäschen', () => {
    expect(planConversionToMenge([stueck({ waschgaenge: 2 })], []).hasWaeschen).toBe(true);
    expect(planConversionToMenge([stueck({})], []).hasWaeschen).toBe(false);
  });
});
