import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand, GeraetCharge } from './geraet';
import {
  activeChargen,
  allocateFefo,
  applyChargeDelta,
  chargePots,
  chargeTotals,
  expiringChargen,
  expiryStatus,
  needsChargeChoice,
  restOhneCharge,
  shrinkChargen,
  sortFefo,
  validChargenTeile,
} from './geraetCharge';

const NOW = '2026-10-08T10:00:00.000Z';

function charge(id: string, extra: Partial<GeraetCharge> = {}): GeraetCharge {
  return { id, createdAt: NOW, createdBy: 'u1', ...extra };
}

function bestand(
  id: string,
  anzahl: number,
  chargen?: Record<string, number>,
  extra: Partial<GeraetBestand> = {},
): GeraetBestand {
  return {
    id,
    geraetId: 'g1',
    lagerortKey: `raum|fwh|${id}`,
    lagerort: { art: 'raum', standort: 'FWH', raum: id },
    anzahl,
    ...(chargen ? { chargen } : {}),
    ...extra,
  };
}

function geraet(extra: Partial<Geraet> = {}): Geraet {
  return {
    id: 'g1',
    bezeichnung: 'Ölbindemittel',
    verbrauchsmaterial: true,
    bestandGesamt: 0,
    active: true,
    createdAt: NOW,
    createdBy: 'u1',
    updatedAt: NOW,
    updatedBy: 'u1',
    ...extra,
  };
}

// c1 läuft zuerst ab, c2 danach, c3 ohne Ablaufdatum.
const C1 = charge('c1', { ablaufDatum: '2027-01-01' });
const C2 = charge('c2', { ablaufDatum: '2027-06-01' });
const C3 = charge('c3', { einkaufsDatum: '2026-01-01' });
const CHARGEN = [C3, C2, C1];

describe('activeChargen', () => {
  it('liefert nur nicht archivierte Chargen', () => {
    const archived = charge('cx', { archiviert: true });
    expect(activeChargen(geraet({ chargen: [C1, archived, C2] }))).toEqual([C1, C2]);
  });

  it('ohne Chargen eine leere Liste', () => {
    expect(activeChargen(geraet())).toEqual([]);
  });
});

describe('sortFefo', () => {
  it('sortiert nach Ablaufdatum, Chargen ohne Ablaufdatum zuletzt', () => {
    expect(sortFefo(CHARGEN).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('ohne Ablaufdatum nach Einkaufsdatum, dann nach ID', () => {
    const a = charge('a', { einkaufsDatum: '2026-05-01' });
    const b = charge('b', { einkaufsDatum: '2026-02-01' });
    const z = charge('z');
    const y = charge('y');
    expect(sortFefo([z, a, y, b]).map((c) => c.id)).toEqual(['b', 'a', 'y', 'z']);
  });

  it('verändert die Eingabe nicht', () => {
    const input = [...CHARGEN];
    sortFefo(input);
    expect(input).toEqual(CHARGEN);
  });
});

describe('restOhneCharge', () => {
  it('ist die Anzahl abzüglich der Chargen', () => {
    expect(restOhneCharge(bestand('b1', 10, { c1: 3, c2: 4 }))).toBe(3);
  });

  it('ohne Chargen die ganze Anzahl', () => {
    expect(restOhneCharge(bestand('b1', 7))).toBe(7);
  });

  it('darf negativ sein und rechnet ohne Rundungsrest', () => {
    expect(restOhneCharge(bestand('b1', 2, { c1: 3 }))).toBe(-1);
    expect(restOhneCharge(bestand('b1', 0.3, { c1: 0.1, c2: 0.2 }))).toBe(0);
  });
});

describe('chargePots', () => {
  it('liefert die Chargen in FEFO-Reihenfolge und zuletzt den Rest', () => {
    expect(chargePots(bestand('b1', 10, { c2: 4, c1: 3 }), CHARGEN)).toEqual([
      { chargeId: 'c1', menge: 3 },
      { chargeId: 'c2', menge: 4 },
      { chargeId: null, menge: 3 },
    ]);
  });

  it('zählt archivierte Chargen als bekannt', () => {
    const archived = charge('cx', { archiviert: true, ablaufDatum: '2026-01-01' });
    expect(chargePots(bestand('b1', 5, { cx: 2 }), [C1, archived])).toEqual([
      { chargeId: 'cx', menge: 2 },
      { chargeId: null, menge: 3 },
    ]);
  });

  it('zählt unbekannte Chargen in den Rest', () => {
    expect(chargePots(bestand('b1', 5, { c1: 1, weg: 2 }), CHARGEN)).toEqual([
      { chargeId: 'c1', menge: 1 },
      { chargeId: null, menge: 4 },
    ]);
  });

  it('ohne Aufteilung nur der Rest', () => {
    expect(chargePots(bestand('b1', 5), CHARGEN)).toEqual([{ chargeId: null, menge: 5 }]);
  });
});

describe('needsChargeChoice', () => {
  it('true bei mehr als einem Topf mit Bestand', () => {
    expect(needsChargeChoice(bestand('b1', 5, { c1: 2 }), CHARGEN)).toBe(true);
    expect(needsChargeChoice(bestand('b1', 5, { c1: 2, c2: 3 }), CHARGEN)).toBe(true);
  });

  it('false bei höchstens einem Topf mit Bestand', () => {
    expect(needsChargeChoice(bestand('b1', 5), CHARGEN)).toBe(false);
    expect(needsChargeChoice(bestand('b1', 5, { c1: 5 }), CHARGEN)).toBe(false);
    expect(needsChargeChoice(bestand('b1', 0), CHARGEN)).toBe(false);
  });
});

describe('allocateFefo', () => {
  it('nimmt zuerst die früher ablaufende Charge', () => {
    expect(allocateFefo(bestand('b1', 10, { c1: 3, c2: 4 }), CHARGEN, 2)).toEqual([
      { chargeId: 'c1', menge: 2 },
    ]);
  });

  it('füllt die Chargen der Reihe nach auf, der Überhang geht auf den Rest', () => {
    expect(allocateFefo(bestand('b1', 10, { c1: 3, c2: 4 }), CHARGEN, 9)).toEqual([
      { chargeId: 'c1', menge: 3 },
      { chargeId: 'c2', menge: 4 },
      { chargeId: null, menge: 2 },
    ]);
  });

  it('darf den Rest ohne Charge überziehen', () => {
    expect(allocateFefo(bestand('b1', 5, { c1: 5 }), CHARGEN, 8)).toEqual([
      { chargeId: 'c1', menge: 5 },
      { chargeId: null, menge: 3 },
    ]);
  });

  it('überspringt leere oder negative Chargen', () => {
    expect(allocateFefo(bestand('b1', 5, { c1: -1, c2: 2 }), CHARGEN, 3)).toEqual([
      { chargeId: 'c2', menge: 2 },
      { chargeId: null, menge: 1 },
    ]);
  });

  it('ohne Chargen alles auf den Rest', () => {
    expect(allocateFefo(bestand('b1', 5), [], 3)).toEqual([{ chargeId: null, menge: 3 }]);
  });

  it('die Summe ist genau die Menge', () => {
    const teile = allocateFefo(bestand('b1', 1, { c1: 0.1, c2: 0.2 }), CHARGEN, 0.7);
    expect(teile).toEqual([
      { chargeId: 'c1', menge: 0.1 },
      { chargeId: 'c2', menge: 0.2 },
      { chargeId: null, menge: 0.4 },
    ]);
  });
});

describe('shrinkChargen', () => {
  it('nimmt zuerst vom Rest ohne Charge', () => {
    expect(shrinkChargen(bestand('b1', 10, { c1: 3, c2: 4 }), CHARGEN, 8)).toEqual({
      c1: 3,
      c2: 4,
    });
  });

  it('danach von den Chargen in FEFO-Reihenfolge und entfernt leere', () => {
    expect(shrinkChargen(bestand('b1', 10, { c1: 3, c2: 4 }), CHARGEN, 5)).toEqual({
      c1: 1,
      c2: 4,
    });
    expect(shrinkChargen(bestand('b1', 10, { c1: 3, c2: 4 }), CHARGEN, 3)).toEqual({
      c2: 3,
    });
  });

  it('geht nie unter 0', () => {
    expect(shrinkChargen(bestand('b1', 10, { c1: 3, c2: 4 }), CHARGEN, -2)).toEqual({});
  });

  it('verkleinert danach auch unbekannte Chargen, bis die Map in anzahl passt', () => {
    // Σ Map 12 > anzahl 10: c1 ist bekannt, y und z sind es nicht.
    expect(shrinkChargen(bestand('b1', 10, { z: 5, c1: 3, y: 4 }), CHARGEN, 4)).toEqual({
      z: 4,
    });
    // Negative unbekannte Einträge bleiben, wie sie sind.
    expect(shrinkChargen(bestand('b1', 3, { c1: 1, x: 4, w: -1 }), CHARGEN, 2)).toEqual({
      x: 3,
      w: -1,
    });
  });

  it('lässt die Aufteilung beim Steigen unverändert (Kopie)', () => {
    const map = { c1: 3 };
    const result = shrinkChargen(bestand('b1', 5, map), CHARGEN, 9);
    expect(result).toEqual({ c1: 3 });
    expect(result).not.toBe(map);
  });

  it('ohne Aufteilung eine leere', () => {
    expect(shrinkChargen(bestand('b1', 5), CHARGEN, 2)).toEqual({});
  });
});

describe('applyChargeDelta', () => {
  it('ändert die Menge einer Charge', () => {
    expect(applyChargeDelta({ c1: 3 }, 'c1', -1)).toEqual({ c1: 2 });
    expect(applyChargeDelta({ c1: 3 }, 'c2', 2)).toEqual({ c1: 3, c2: 2 });
  });

  it('entfernt eine Charge bei 0 und darf negativ werden', () => {
    expect(applyChargeDelta({ c1: 3 }, 'c1', -3)).toEqual({});
    expect(applyChargeDelta({ c1: 0.3 }, 'c1', -0.1 - 0.2)).toEqual({});
    expect(applyChargeDelta({}, 'c1', -2)).toEqual({ c1: -2 });
  });

  it('ohne Charge eine unveränderte Kopie', () => {
    const map = { c1: 3 };
    const result = applyChargeDelta(map, null, 5);
    expect(result).toEqual({ c1: 3 });
    expect(result).not.toBe(map);
    expect(applyChargeDelta(undefined, 'c1', 1)).toEqual({ c1: 1 });
  });

  it('verändert die Eingabe nicht', () => {
    const map = { c1: 3 };
    applyChargeDelta(map, 'c1', 1);
    expect(map).toEqual({ c1: 3 });
  });
});

describe('expiryStatus', () => {
  const TODAY = '2026-10-08';

  it('ohne Ablaufdatum ok', () => {
    expect(expiryStatus(charge('c'), TODAY)).toBe('ok');
  });

  it('gestern abgelaufen', () => {
    expect(expiryStatus(charge('c', { ablaufDatum: '2026-10-07' }), TODAY)).toBe(
      'abgelaufen',
    );
  });

  it('heute und bis zum Vorlauf bald', () => {
    expect(expiryStatus(charge('c', { ablaufDatum: '2026-10-08' }), TODAY)).toBe('bald');
    // 08.10. + 60 Tage = 07.12.
    expect(expiryStatus(charge('c', { ablaufDatum: '2026-12-07' }), TODAY)).toBe('bald');
    expect(expiryStatus(charge('c', { ablaufDatum: '2026-12-08' }), TODAY)).toBe('ok');
  });

  it('nimmt aus einem ISO-Zeitpunkt nur das Datum', () => {
    expect(expiryStatus(charge('c', { ablaufDatum: '2026-10-08' }), NOW)).toBe('bald');
  });

  it('beachtet einen eigenen Vorlauf', () => {
    const c = charge('c', { ablaufDatum: '2026-10-20' });
    expect(expiryStatus(c, TODAY, 7)).toBe('ok');
    expect(expiryStatus(c, TODAY, 12)).toBe('bald');
  });
});

describe('chargeTotals', () => {
  it('summiert je Charge über die nicht archivierten Lagerorte des Artikels', () => {
    const totals = chargeTotals(geraet(), [
      bestand('b1', 10, { c1: 3, c2: 1 }),
      bestand('b2', 5, { c1: 2 }),
      bestand('b3', 5, { c1: 9 }, { archiviert: true }),
      bestand('b4', 5, { c1: 7 }, { geraetId: 'g2' }),
    ]);
    expect(totals).toEqual(
      new Map([
        ['c1', 5],
        ['c2', 1],
      ]),
    );
  });
});

describe('expiringChargen', () => {
  const TODAY = '2026-10-08';
  const late = charge('late', { ablaufDatum: '2026-11-30' });
  const expired = charge('exp', { ablaufDatum: '2026-09-01' });
  const fine = charge('fine', { ablaufDatum: '2028-01-01' });
  const empty = charge('empty', { ablaufDatum: '2026-09-02' });
  const archived = charge('arch', { ablaufDatum: '2026-09-03', archiviert: true });

  it('meldet bald ablaufende und abgelaufene Chargen mit Bestand, sortiert', () => {
    const g = geraet({ chargen: [late, expired, fine, empty, archived] });
    const b1 = bestand('b1', 20, { late: 2, exp: 1, fine: 5, arch: 1 });
    const b2 = bestand('b2', 5, { late: 3, empty: 0 });
    const result = expiringChargen([g], [b1, b2], TODAY);
    expect(result).toEqual([
      {
        geraet: g,
        charge: expired,
        status: 'abgelaufen',
        menge: 1,
        jeBestand: [{ bestand: b1, menge: 1 }],
      },
      {
        geraet: g,
        charge: late,
        status: 'bald',
        menge: 5,
        jeBestand: [
          { bestand: b1, menge: 2 },
          { bestand: b2, menge: 3 },
        ],
      },
    ]);
  });

  it('übergeht inaktive Artikel und Nicht-Verbrauchsmaterial', () => {
    const b = bestand('b1', 5, { exp: 1 });
    expect(expiringChargen([geraet({ chargen: [expired], active: false })], [b], TODAY)).toEqual(
      [],
    );
    expect(
      expiringChargen([geraet({ chargen: [expired], verbrauchsmaterial: false })], [b], TODAY),
    ).toEqual([]);
  });

  it('nimmt den Vorlauf des Artikels', () => {
    const g = geraet({ chargen: [late], ablaufVorlaufTage: 10 });
    expect(expiringChargen([g], [bestand('b1', 5, { late: 2 })], TODAY)).toEqual([]);
  });
});

describe('validChargenTeile', () => {
  const ids = ['c1', 'c2'];

  it('akzeptiert eine stimmige Aufteilung', () => {
    expect(
      validChargenTeile(
        [
          { chargeId: 'c1', menge: 2 },
          { chargeId: null, menge: 1 },
        ],
        3,
        ids,
      ),
    ).toBe(true);
    expect(
      validChargenTeile(
        [
          { chargeId: 'c1', menge: 0.1 },
          { chargeId: 'c2', menge: 0.2 },
        ],
        0.3,
        new Set(ids),
      ),
    ).toBe(true);
  });

  it('lehnt eine falsche Summe ab', () => {
    expect(validChargenTeile([{ chargeId: 'c1', menge: 2 }], 3, ids)).toBe(false);
  });

  it('lehnt unbekannte Chargen und doppelte Töpfe ab', () => {
    expect(validChargenTeile([{ chargeId: 'cx', menge: 3 }], 3, ids)).toBe(false);
    expect(
      validChargenTeile(
        [
          { chargeId: 'c1', menge: 1 },
          { chargeId: 'c1', menge: 2 },
        ],
        3,
        ids,
      ),
    ).toBe(false);
    expect(
      validChargenTeile(
        [
          { chargeId: null, menge: 1 },
          { chargeId: null, menge: 2 },
        ],
        3,
        ids,
      ),
    ).toBe(false);
  });

  it('lehnt ungültige Mengen und Nicht-Arrays ab', () => {
    expect(validChargenTeile([{ chargeId: 'c1', menge: -1 }, { chargeId: null, menge: 4 }], 3, ids)).toBe(
      false,
    );
    expect(validChargenTeile([{ chargeId: 'c1', menge: Number.NaN }], 3, ids)).toBe(false);
    expect(validChargenTeile('x' as unknown as [], 3, ids)).toBe(false);
  });
});
