import { describe, expect, it } from 'vitest';
import type { RechenSchritt } from '../rechenweg';
import { pendelRechenweg } from './rechenweg';
import type { PendelView } from './pendelverkehr';
import { FOERDERUNG_DEFAULTS } from '../foerderung/defaults';
import { computeShuttle } from './shuttle';

/**
 * Geprüft wird, ob der Rechenweg **dieselbe** Rechnung zeigt, die das Ergebnis
 * erzeugt hat. Ein Rechenweg, der eine plausible, aber andere Herleitung
 * vorführt, ist schlimmer als keiner: Er sieht aus wie eine Kontrolle und ist
 * keine.
 *
 * Formatiert wird mit einem einfachen Punkt-Format, damit die Zusicherungen
 * nicht an der Sprache des Testläufers hängen.
 */
const fmt = (value: number, digits = 1) => value.toFixed(digits);

/** Der Prüfstein aus `shuttle.test.ts`: 2000 m, 40 km/h, 2000 l, 800 l/min. */
const view = (overrides: Partial<PendelView['params']> = {}): PendelView => {
  const params = {
    fahrzeuge: 3,
    tankinhalt: 2000,
    geschwindigkeit: 40,
    fuellleistung: 800,
    rangierzeit: 1,
    entleerzeit: 3,
    ...overrides,
  };
  return {
    params,
    sollMenge: 400,
    strecke: 2000,
    streckeSource: 'route',
    fuellleistungSource: 'manual',
    result: computeShuttle({
      strecke: 2000,
      sollMenge: 400,
      ...params,
    }),
    warnings: [],
  };
};

const find = (schritte: RechenSchritt[], label: RechenSchritt['label']) => {
  const schritt = schritte.find((s) => s.label === label);
  if (!schritt) throw new Error(`Schritt ${label} fehlt`);
  return schritt;
};

describe('pendelRechenweg', () => {
  it('weist die geforderte Menge als Planungswert aus, solange sie es ist', () => {
    // 1000 l/min ist die Vorbelegung beider Rechner. Sie als „Eingabe" zu
    // führen verwischt genau den Unterschied, für den es die Spalte gibt.
    const vorbelegt = pendelRechenweg(
      { ...view(), sollMenge: FOERDERUNG_DEFAULTS.foerderMenge },
      fmt
    );
    expect(find(vorbelegt, 'stepRequiredFlow').herkunft).toBe('vorgabe');
    // Und die 400 l/min des Prüfsteins hat jemand eingetragen.
    expect(find(pendelRechenweg(view(), fmt), 'stepRequiredFlow').herkunft).toBe(
      'eingabe'
    );
  });

  it('begründet die fehlende Fahrzeugzahl mit dem, was tatsächlich fehlt', () => {
    // Ohne geforderte Menge fehlen Fahrzeugzahl und Kipppunkt ebenfalls — aber
    // nicht, weil die Entnahmestelle deckelt. Der Grund kommt aus dem Ergebnis
    // und wird nicht aus der fehlenden Zahl erraten.
    const ohneAnforderung = pendelRechenweg(
      {
        ...view(),
        sollMenge: 0,
        result: computeShuttle({
          strecke: 2000,
          sollMenge: 0,
          fahrzeuge: 3,
          tankinhalt: 2000,
          geschwindigkeit: 40,
          fuellleistung: 800,
          rangierzeit: 1,
          entleerzeit: 3,
        }),
      },
      fmt
    );
    expect(find(ohneAnforderung, 'stepVehiclesForRequiredFlow').hinweis).toBe(
      'hintNoValueNoRequirement'
    );
    expect(find(ohneAnforderung, 'stepTippingPoint').hinweis).toBe(
      'hintNoValueNoRequirement'
    );

    // Deckelt die Entnahmestelle dagegen wirklich, steht ihr Satz da.
    const gedeckelt = pendelRechenweg(
      {
        ...view(),
        sollMenge: 1000,
        result: computeShuttle({
          strecke: 2000,
          sollMenge: 1000,
          fahrzeuge: 3,
          tankinhalt: 2000,
          geschwindigkeit: 40,
          fuellleistung: 800,
          rangierzeit: 1,
          entleerzeit: 3,
        }),
      },
      fmt
    );
    expect(find(gedeckelt, 'stepVehiclesForRequiredFlow').hinweis).toBe(
      'hintNoValueFillStation'
    );
  });

  it('setzt in jede Rechnung die Zahlen ein, mit denen gerechnet wurde', () => {
    const schritte = pendelRechenweg(view(), fmt);

    // 40 km/h sind 666,7 m/min; hin und zurück 4000 m also 6,0 min.
    expect(find(schritte, 'stepSpeedPerMinute').rechnung).toBe('40 · 1000 / 60');
    expect(find(schritte, 'stepDriveTime').rechnung).toBe(
      '2 · 2000 m / 666.7 m/min'
    );
    expect(find(schritte, 'stepDriveTime').wert).toBe('6.0');

    // 2000 l bei 800 l/min sind 2,5 min, plus 1 min Rangieren 3,5 min.
    expect(find(schritte, 'stepNetFillTime').rechnung).toBe(
      '2000 l / 800 l/min'
    );
    expect(find(schritte, 'stepFillTime').rechnung).toBe('2.5 min + 1.0 min');
    expect(find(schritte, 'stepFillTime').wert).toBe('3.5');

    expect(find(schritte, 'stepCycleTime').wert).toBe('12.5');
  });

  it('führt die Schranke der Entnahmestelle als eigene Zeile vor', () => {
    // Genau der Schritt, an dem ein naives n·V/t_umlauf falsch wird: Drei
    // Fahrzeuge lieferten 480, die Entnahmestelle gibt 571 her — hier greift
    // sie noch nicht, und das muss zu sehen sein.
    const schritte = pendelRechenweg(view(), fmt);
    expect(find(schritte, 'stepFlowFromVehicles').wert).toBe('480');
    expect(find(schritte, 'stepFillStationLimit').rechnung).toBe(
      '2000 l / 3.5 min'
    );
    expect(find(schritte, 'stepFillStationLimit').wert).toBe('571');
    expect(find(schritte, 'stepShuttleFlow').rechnung).toBe('min(480; 571)');
    expect(find(schritte, 'stepShuttleFlow').wert).toBe('480');
  });

  it('nennt das Ergebnis, auf das der Abschnitt hinausläuft', () => {
    const schritte = pendelRechenweg(view(), fmt);
    expect(schritte.filter((s) => s.ergebnis).map((s) => s.label)).toEqual([
      'stepShuttleFlow',
    ]);
  });

  it('unterscheidet Planungswert und Eingabe an derselben Größe', () => {
    // Die Entleerzeit ist ein Planungswert ohne Unterlage. Wer sie ändert,
    // hat einen Grund — dann steht dort „Eingabe", und die Zahl ist nicht mehr
    // die geschätzte.
    expect(find(pendelRechenweg(view(), fmt), 'stepEmptyTime').herkunft).toBe(
      'vorgabe'
    );
    expect(
      find(pendelRechenweg(view({ entleerzeit: 5 }), fmt), 'stepEmptyTime')
        .herkunft
    ).toBe('eingabe');
  });

  it('weist die Ergiebigkeit aus dem Hydranten als gemessen aus', () => {
    const aus = { ...view(), fuellleistungSource: 'hydrant' as const };
    expect(find(pendelRechenweg(aus, fmt), 'stepFillRate').herkunft).toBe(
      'gemessen'
    );
  });

  it('lässt die Zelle leer, wo es keinen Wert gibt, und sagt warum', () => {
    // Die Füllstelle gibt 571 l/min her, gefordert sind 1000: Weder eine
    // Fahrzeugzahl noch eine Entfernung trägt die Menge.
    const hart: PendelView = { ...view(), sollMenge: 1000 };
    hart.result = computeShuttle({
      strecke: 2000,
      sollMenge: 1000,
      ...hart.params,
    });
    const schritte = pendelRechenweg(hart, fmt);

    const fahrzeuge = find(schritte, 'stepVehiclesForRequiredFlow');
    expect(fahrzeuge.wert).toBeUndefined();
    expect(fahrzeuge.hinweis).toBe('hintNoValueFillStation');

    const kipp = find(schritte, 'stepTippingPoint');
    expect(kipp.wert).toBeUndefined();
    expect(kipp.hinweis).toBe('hintNoValueFillStation');
  });

  it('vermerkt eine nicht geroutete Fahrstrecke an der Zeile selbst', () => {
    const gezeichnet: PendelView = { ...view(), streckeSource: 'drawn' };
    expect(find(pendelRechenweg(gezeichnet, fmt), 'stepDriveDistance').hinweis).toBe(
      'hintDrawnDistance'
    );
    expect(
      find(pendelRechenweg(view(), fmt), 'stepDriveDistance').hinweis
    ).toBeUndefined();
  });

  it('zeigt ohne rechenbares Ergebnis nur die Eingaben', () => {
    const ohne: PendelView = {
      ...view(),
      params: { ...view().params, fuellleistung: undefined },
      result: undefined,
    };
    const schritte = pendelRechenweg(ohne, fmt);
    // Die Eingaben stehen da — samt der leeren Ergiebigkeit, denn genau sie
    // fehlt und das ist die Auskunft.
    expect(find(schritte, 'stepFillRate').wert).toBeUndefined();
    // Nichts Gerechnetes, das es nicht gibt.
    expect(schritte.some((s) => s.label === 'stepCycleTime')).toBe(false);
    expect(schritte.some((s) => s.label === 'stepShuttleFlow')).toBe(false);
  });

  it('nennt jede Größe nur einmal — die Zeilen sind über das Label verschlüsselt', () => {
    const labels = pendelRechenweg(view(), fmt).map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
