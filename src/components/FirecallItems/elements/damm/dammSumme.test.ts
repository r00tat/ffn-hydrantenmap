// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { FirecallItem, Line } from '../../../firebase/firestore';
import { dammSumme } from './dammSumme';

/** Eine Nord-Süd-Linie von `meter` Länge, grob über die Breite gerechnet. */
const line = (fields: Partial<Line> & { meter?: number } = {}): Line => {
  const { meter = 100, ...rest } = fields;
  return {
    type: 'line',
    name: 'Abschnitt',
    dammbau: 'true',
    positions: JSON.stringify([
      [47.9, 16.84],
      [47.9 + meter / 111_320, 16.84],
    ]),
    ...rest,
  } as Line;
};

describe('dammSumme', () => {
  it('bleibt ohne Dammabschnitt leer', () => {
    expect(dammSumme([])).toBeUndefined();
    expect(
      dammSumme([{ type: 'line', name: 'nur eine Linie' } as FirecallItem])
    ).toBeUndefined();
  });

  it('nimmt nur Linien mit aktivem Rechner', () => {
    const summe = dammSumme([
      line({ name: 'A' }),
      line({ name: 'B', dammbau: 'false' }),
      { type: 'connection', name: 'Leitung' } as FirecallItem,
    ]);
    expect(summe?.abschnitte).toHaveLength(1);
    expect(summe?.abschnitte[0].name).toBe('A');
  });

  it('lässt gelöschte Abschnitte draußen', () => {
    expect(
      dammSumme([line({ name: 'A', deleted: true } as Partial<Line>)])
    ).toBeUndefined();
  });

  it('summiert Länge, Säcke, Sand und Fuhren über die Abschnitte', () => {
    const summe = dammSumme([
      line({ name: 'A', meter: 100, dammHoehe: 1 }),
      line({ name: 'B', meter: 50, dammHoehe: 0.5 }),
    ])!;
    expect(summe.abschnitte).toHaveLength(2);
    expect(summe.laenge).toBeCloseTo(
      summe.abschnitte[0].laenge + summe.abschnitte[1].laenge,
      3
    );
    expect(summe.saecke).toBe(
      summe.abschnitte[0].bedarf.saecke + summe.abschnitte[1].bedarf.saecke
    );
    expect(summe.sandMasse).toBeCloseTo(
      summe.abschnitte[0].bedarf.sandMasse +
        summe.abschnitte[1].bedarf.sandMasse,
      6
    );
    // Aufgerundet wird über die Gesamtmenge, nicht je Abschnitt: Ein halb
    // beladener LKW fährt nicht zweimal.
    expect(summe.paletten).toBe(Math.ceil(summe.saecke / 50));
    expect(summe.lkwFuhrenSaecke).toBe(Math.ceil(summe.paletten / 10));
    expect(summe.lkwFuhrenSand).toBe(Math.ceil(summe.sandMasse / 10));
  });

  it('nimmt die Bauzeit des längsten Abschnitts, nicht die Summe', () => {
    // Jeder Abschnitt hat seine eigene Mannschaft, und die Abschnitte werden
    // gleichzeitig gebaut — fertig ist der Damm, wenn der letzte steht.
    const summe = dammSumme([
      line({ name: 'A', meter: 100, dammHoehe: 1, dammPersonal: 10 }),
      line({ name: 'B', meter: 20, dammHoehe: 0.5, dammPersonal: 6 }),
    ])!;
    expect(summe.personal).toBe(16);
    expect(summe.bauzeit).toBe(
      Math.max(...summe.abschnitte.map((a) => a.bedarf.bauzeit))
    );
    expect(summe.bauzeit).toBe(summe.abschnitte[0].bedarf.bauzeit);
  });

  it('bleibt ohne Kräfte bei einer Bauzeit von null', () => {
    const summe = dammSumme([line({ dammPersonal: 0 })])!;
    expect(summe.personal).toBe(0);
    expect(summe.bauzeit).toBe(0);
  });

  it('sammelt die Warnungen der Abschnitte ohne Doppelnennung', () => {
    const summe = dammSumme([
      line({ name: 'A', dammBauweise: 'einfach', dammHoehe: 0.6 }),
      line({ name: 'B', dammBauweise: 'einfach', dammHoehe: 0.8 }),
    ])!;
    expect(summe.warnings.filter((w) => w === 'einfachZuHoch')).toHaveLength(1);
  });
});
