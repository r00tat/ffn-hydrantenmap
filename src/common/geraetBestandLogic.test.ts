import { describe, expect, it } from 'vitest';
import {
  applyStockDelta,
  capVerbrauchTarget,
  isOutdatedEntry,
  reconcileVerbrauch,
} from './geraetBestandLogic';

const NOW = '2026-10-04T10:00:00.000Z';
const EARLIER = '2026-09-01T08:00:00.000Z';

describe('applyStockDelta', () => {
  it('rechnet den Gesamtbestand fort', () => {
    expect(applyStockDelta({ bestandGesamt: 10 }, -3, NOW)).toEqual({
      bestandGesamt: 7,
      nachbestellenSeit: null,
      crossedBelow: false,
    });
  });

  it('meldet ohne Mindestbestand nie ein Unterschreiten', () => {
    const result = applyStockDelta({ bestandGesamt: 1 }, -5, NOW);
    expect(result.bestandGesamt).toBe(-4);
    expect(result.crossedBelow).toBe(false);
    expect(result.nachbestellenSeit).toBeNull();
  });

  it('erkennt den Übergang unter den Mindestbestand', () => {
    expect(
      applyStockDelta({ bestandGesamt: 5, mindestbestand: 5 }, -1, NOW),
    ).toEqual({ bestandGesamt: 4, nachbestellenSeit: NOW, crossedBelow: true });
  });

  it('bleibt auf dem Mindestbestand ohne Meldung', () => {
    expect(
      applyStockDelta({ bestandGesamt: 7, mindestbestand: 5 }, -2, NOW),
    ).toEqual({ bestandGesamt: 5, nachbestellenSeit: null, crossedBelow: false });
  });

  it('meldet weitere Verbräuche unter dem Mindestbestand nicht erneut', () => {
    expect(
      applyStockDelta(
        { bestandGesamt: 4, mindestbestand: 5, nachbestellenSeit: EARLIER },
        -2,
        NOW,
      ),
    ).toEqual({
      bestandGesamt: 2,
      nachbestellenSeit: EARLIER,
      crossedBelow: false,
    });
  });

  it('setzt den Zeitpunkt nach, wenn er unter dem Mindestbestand fehlt', () => {
    // Etwa wenn der Mindestbestand erst nachträglich eingetragen wurde: Der
    // Artikel steht dann auf der Liste, eine Meldung gibt es aber nicht.
    expect(
      applyStockDelta({ bestandGesamt: 2, mindestbestand: 5 }, -1, NOW),
    ).toEqual({ bestandGesamt: 1, nachbestellenSeit: NOW, crossedBelow: false });
  });

  it('löscht die Nachbestellung beim Wiederauffüllen', () => {
    expect(
      applyStockDelta(
        { bestandGesamt: 2, mindestbestand: 5, nachbestellenSeit: EARLIER },
        10,
        NOW,
      ),
    ).toEqual({
      bestandGesamt: 12,
      nachbestellenSeit: null,
      crossedBelow: false,
    });
  });

  it('löscht eine Nachbestellung, wenn kein Mindestbestand mehr gilt', () => {
    expect(
      applyStockDelta(
        { bestandGesamt: 2, nachbestellenSeit: EARLIER },
        0,
        NOW,
      ).nachbestellenSeit,
    ).toBeNull();
  });

  it('meldet nach dem Wiederauffüllen ein erneutes Unterschreiten', () => {
    const refilled = applyStockDelta(
      { bestandGesamt: 2, mindestbestand: 5, nachbestellenSeit: EARLIER },
      8,
      NOW,
    );
    const again = applyStockDelta(
      { mindestbestand: 5, ...refilled },
      -7,
      NOW,
    );
    expect(again.crossedBelow).toBe(true);
    expect(again.nachbestellenSeit).toBe(NOW);
  });
});

describe('reconcileVerbrauch', () => {
  it('bucht einen neuen Verbrauch ab', () => {
    expect(reconcileVerbrauch({ bestandId: 'b1', menge: 3 }, [])).toEqual([
      { bestandId: 'b1', chargeId: null, delta: -3 },
    ]);
  });

  it('ist bei wiederholtem Aufruf idempotent', () => {
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: 3 }, [
        { bestandId: 'b1', menge: -3 },
      ]),
    ).toEqual([]);
  });

  it('bucht nur die Differenz bei geänderter Menge', () => {
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: 5 }, [
        { bestandId: 'b1', menge: -3 },
      ]),
    ).toEqual([{ bestandId: 'b1', chargeId: null, delta: -2 }]);
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: 1 }, [
        { bestandId: 'b1', menge: -3 },
      ]),
    ).toEqual([{ bestandId: 'b1', chargeId: null, delta: 2 }]);
  });

  it('bucht beim Wechsel des Lagerorts um', () => {
    expect(
      reconcileVerbrauch({ bestandId: 'b2', menge: 3 }, [
        { bestandId: 'b1', menge: -3 },
      ]),
    ).toEqual([
      { bestandId: 'b2', chargeId: null, delta: -3 },
      { bestandId: 'b1', chargeId: null, delta: 3 },
    ]);
  });

  it('storniert einen gelöschten Verbrauch', () => {
    expect(
      reconcileVerbrauch(null, [
        { bestandId: 'b1', menge: -3 },
        { bestandId: 'b1', menge: -2 },
      ]),
    ).toEqual([{ bestandId: 'b1', chargeId: null, delta: 5 }]);
  });

  it('summiert frühere Korrekturen mit', () => {
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: 4 }, [
        { bestandId: 'b1', menge: -3 },
        { bestandId: 'b1', menge: -2 },
        { bestandId: 'b1', menge: 1 },
      ]),
    ).toEqual([]);
  });

  it('behandelt eine ungültige Menge wie keinen Verbrauch', () => {
    expect(reconcileVerbrauch({ bestandId: 'b1', menge: 0 }, [])).toEqual([]);
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: Number.NaN }, [
        { bestandId: 'b1', menge: -2 },
      ]),
    ).toEqual([{ bestandId: 'b1', chargeId: null, delta: 2 }]);
  });

  it('rechnet Kommazahlen ohne Rundungsrest', () => {
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: 0.3 }, [
        { bestandId: 'b1', menge: -0.1 },
        { bestandId: 'b1', menge: -0.2 },
      ]),
    ).toEqual([]);
  });
});

describe('reconcileVerbrauch mit Chargen', () => {
  it('bucht die Teile je Charge ab', () => {
    expect(
      reconcileVerbrauch(
        {
          bestandId: 'b1',
          menge: 5,
          teile: [
            { chargeId: 'c1', menge: 3 },
            { chargeId: null, menge: 2 },
          ],
        },
        [],
      ),
    ).toEqual([
      { bestandId: 'b1', chargeId: 'c1', delta: -3 },
      { bestandId: 'b1', chargeId: null, delta: -2 },
    ]);
  });

  it('bucht beim Chargenwechsel gleicher Menge um', () => {
    expect(
      reconcileVerbrauch({ bestandId: 'b1', menge: 3, teile: [{ chargeId: 'c2', menge: 3 }] }, [
        { bestandId: 'b1', menge: -3, chargeId: 'c1' },
      ]),
    ).toEqual([
      { bestandId: 'b1', chargeId: 'c2', delta: -3 },
      { bestandId: 'b1', chargeId: 'c1', delta: 3 },
    ]);
  });

  it('bucht nur die Differenz einer geänderten Aufteilung', () => {
    expect(
      reconcileVerbrauch(
        {
          bestandId: 'b1',
          menge: 5,
          teile: [
            { chargeId: 'c1', menge: 1 },
            { chargeId: 'c2', menge: 4 },
          ],
        },
        [
          { bestandId: 'b1', menge: -3, chargeId: 'c1' },
          { bestandId: 'b1', menge: -2, chargeId: 'c2' },
        ],
      ),
    ).toEqual([
      { bestandId: 'b1', chargeId: 'c1', delta: 2 },
      { bestandId: 'b1', chargeId: 'c2', delta: -2 },
    ]);
  });

  it('storniert einen gelöschten Verbrauch je Charge', () => {
    expect(
      reconcileVerbrauch(null, [
        { bestandId: 'b1', menge: -3, chargeId: 'c1' },
        { bestandId: 'b1', menge: -2 },
        { bestandId: 'b1', menge: -1, chargeId: 'c1' },
      ]),
    ).toEqual([
      { bestandId: 'b1', chargeId: 'c1', delta: 4 },
      { bestandId: 'b1', chargeId: null, delta: 2 },
    ]);
  });

  it('zählt alte Buchungen ohne Charge als Rest ohne Charge', () => {
    expect(
      reconcileVerbrauch(
        {
          bestandId: 'b1',
          menge: 3,
          teile: [
            { chargeId: null, menge: 1 },
            { chargeId: 'c1', menge: 2 },
          ],
        },
        [{ bestandId: 'b1', menge: -3 }],
      ),
    ).toEqual([
      { bestandId: 'b1', chargeId: null, delta: 2 },
      { bestandId: 'b1', chargeId: 'c1', delta: -2 },
    ]);
  });

  it('ist nach dem Buchen idempotent', () => {
    const target = {
      bestandId: 'b1',
      menge: 5,
      teile: [
        { chargeId: 'c1', menge: 3 },
        { chargeId: null, menge: 2 },
        { chargeId: 'c2', menge: 0 },
      ],
    };
    const first = reconcileVerbrauch(target, [{ bestandId: 'b0', menge: -4, chargeId: 'c9' }]);
    const booked = [
      { bestandId: 'b0', menge: -4, chargeId: 'c9' },
      ...first.map((c) => ({ bestandId: c.bestandId, menge: c.delta, chargeId: c.chargeId })),
    ];
    expect(first).toEqual([
      { bestandId: 'b1', chargeId: 'c1', delta: -3 },
      { bestandId: 'b1', chargeId: null, delta: -2 },
      { bestandId: 'b0', chargeId: 'c9', delta: 4 },
    ]);
    expect(reconcileVerbrauch(target, booked)).toEqual([]);
  });
});

describe('isOutdatedEntry', () => {
  it('ohne Erwartung ist jeder Stand recht', () => {
    expect(isOutdatedEntry(undefined, undefined)).toBe(false);
    expect(isOutdatedEntry({ syncRev: 1 }, undefined)).toBe(false);
  });

  it('erwartet gelöscht: veraltet, solange der Eintrag noch da ist', () => {
    expect(isOutdatedEntry({ syncRev: 5 }, { deleted: true })).toBe(true);
    expect(isOutdatedEntry(undefined, { deleted: true })).toBe(false);
  });

  it('erwartet einen Stand: veraltet, wenn der Eintrag fehlt oder älter ist', () => {
    expect(isOutdatedEntry(undefined, { syncRev: 5 })).toBe(true);
    expect(isOutdatedEntry({}, { syncRev: 5 })).toBe(true);
    expect(isOutdatedEntry({ syncRev: 4 }, { syncRev: 5 })).toBe(true);
  });

  it('ein gleicher oder neuerer Stand ist aktuell', () => {
    expect(isOutdatedEntry({ syncRev: 5 }, { syncRev: 5 })).toBe(false);
    // Ein anderes Gerät hat den Eintrag seither geändert.
    expect(isOutdatedEntry({ syncRev: 9 }, { syncRev: 5 })).toBe(false);
  });
});

describe('capVerbrauchTarget', () => {
  const target = { bestandId: 'b1', menge: 5 };

  it('lässt das Ziel eines buchbaren Artikels unverändert', () => {
    expect(capVerbrauchTarget(target, [], true)).toEqual(target);
    expect(capVerbrauchTarget(null, [{ bestandId: 'b1', menge: -3 }], true)).toBeNull();
  });

  it('bucht bei einem nicht buchbaren Artikel nichts Neues ab', () => {
    expect(capVerbrauchTarget(target, [], false)).toBeNull();
  });

  it('lässt einen schon gebuchten Verbrauch stehen, solange er nicht wächst', () => {
    const booked = [{ bestandId: 'b1', menge: -5 }];
    expect(capVerbrauchTarget(target, booked, false)).toEqual(target);
    expect(reconcileVerbrauch(capVerbrauchTarget(target, booked, false), booked)).toEqual([]);
  });

  it('begrenzt eine Erhöhung auf das schon Gebuchte, eine Verringerung bleibt möglich', () => {
    const booked = [{ bestandId: 'b1', menge: -3 }];
    expect(capVerbrauchTarget({ bestandId: 'b1', menge: 8 }, booked, false)).toEqual({
      bestandId: 'b1',
      menge: 3,
    });
    expect(capVerbrauchTarget({ bestandId: 'b1', menge: 1 }, booked, false)).toEqual({
      bestandId: 'b1',
      menge: 1,
    });
  });

  it('summiert das Gebuchte über alle Chargen des Lagerorts', () => {
    const booked = [
      { bestandId: 'b1', menge: -2, chargeId: 'c1' },
      { bestandId: 'b1', menge: -1 },
    ];
    expect(capVerbrauchTarget({ bestandId: 'b1', menge: 8 }, booked, false)).toEqual({
      bestandId: 'b1',
      menge: 3,
    });
  });

  it('behält die Teile eines buchbaren Artikels, verwirft sie beim Begrenzen', () => {
    const teile = [{ chargeId: 'c1', menge: 5 }];
    expect(capVerbrauchTarget({ bestandId: 'b1', menge: 5, teile }, [], true)).toEqual({
      bestandId: 'b1',
      menge: 5,
      teile,
    });
    expect(
      capVerbrauchTarget(
        { bestandId: 'b1', menge: 5, teile },
        [{ bestandId: 'b1', menge: -5, chargeId: 'c1' }],
        false,
      ),
    ).toEqual({ bestandId: 'b1', menge: 5 });
  });

  it('bucht bei einem Lagerortwechsel nur zurück', () => {
    const booked = [{ bestandId: 'b1', menge: -3 }];
    const capped = capVerbrauchTarget({ bestandId: 'b2', menge: 3 }, booked, false);
    expect(capped).toBeNull();
    expect(reconcileVerbrauch(capped, booked)).toEqual([{ bestandId: 'b1', chargeId: null, delta: 3 }]);
  });
});
