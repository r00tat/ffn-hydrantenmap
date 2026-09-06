// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import type { RechenSchritt } from '../rechenweg';
import { elevationSignature, foerderungSamples } from './elevationProfile';
import { FINE_SAMPLING } from './elevationSampling';
import { foerderungView } from './foerderung';
import { foerderungRechenweg } from './rechenweg';

/**
 * Wie im Pendelverkehr: Geprüft wird, ob der Rechenweg **dieselbe** Rechnung
 * zeigt, die das Ergebnis erzeugt hat.
 *
 * Gebaut wird über `foerderungView` und nicht über ein handgeschriebenes
 * Objekt: Der Rechenweg soll gegen die echte Sicht stimmen, und ein von Hand
 * gefülltes `FoerderungView` könnte in sich widersprüchlich sein, ohne dass ein
 * Test es merkt.
 */
const fmt = (value: number, digits = 1) => value.toFixed(digits);

const entnahme: LatLngPosition = [47.9482, 16.8482];
/** Rund 2000 m nach Norden. */
const verteiler: LatLngPosition = [47.9482 + 2000 / 111_320, 16.8482];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: entnahme[0],
    lng: entnahme[1],
    destLat: verteiler[0],
    destLng: verteiler[1],
    positions: JSON.stringify([entnahme, verteiler]),
    dimension: 'B',
    oneHozeLength: 20,
    foerderung: 'true',
    ...overrides,
  }) as Connection;

/** Eine Leitung mit ebenem, zur Lage passendem Höhenprofil. */
const flach = (overrides: Partial<Connection> = {}) => {
  const samples = foerderungSamples(connection(overrides));
  return connection({
    ...overrides,
    elevationProfile: JSON.stringify(samples.map(() => 130)),
    elevationFor: elevationSignature(samples, FINE_SAMPLING.spacingM),
    elevationSpacing: String(FINE_SAMPLING.spacingM),
  });
};

const schritteVon = (item: Connection): RechenSchritt[] => {
  const view = foerderungView(item);
  if (!view) throw new Error('foerderungView lieferte keine Sicht');
  return foerderungRechenweg(view, fmt);
};

const find = (schritte: RechenSchritt[], label: RechenSchritt['label']) => {
  const schritt = schritte.find((s) => s.label === label);
  if (!schritt) throw new Error(`Schritt ${label} fehlt`);
  return schritt;
};

describe('foerderungRechenweg', () => {
  it('führt den Druckbedarf der Strecke vor', () => {
    // 1000 l/min in B 75 sind 1,50 bar je 100 m laut Tabelle; eben also ohne
    // Höhenanteil.
    const schritte = schritteVon(flach());

    expect(find(schritte, 'stepFlowPerLine').rechnung).toBe(
      '1000 l/min / 1'
    );
    expect(find(schritte, 'stepFrictionHose').herkunft).toBe('tabelle');
    expect(find(schritte, 'stepFrictionHose').wert).toBe('1.50');
    expect(find(schritte, 'stepFrictionOverLine').rechnung).toMatch(
      /^1\.50 bar\/100 m · \d+ m \/ 100$/
    );
    expect(find(schritte, 'stepElevationLoss').wert).toBe('0.0');
    expect(find(schritte, 'stepTotalDrop').rechnung).toMatch(
      /^\d+\.\d \+ 0\.0$/
    );
  });

  it('rechnet das Druckbudget einer Pumpe aus den drei Drücken', () => {
    const schritte = schritteVon(flach());
    // 8 − 1,5 = 6,5 bar zwischen zwei Pumpen, 8 − 6 = 2,0 bar bis zum Verteiler.
    expect(find(schritte, 'stepUsableBetweenPumps').rechnung).toBe('8.0 − 1.5');
    expect(find(schritte, 'stepUsableBetweenPumps').wert).toBe('6.5');
    expect(find(schritte, 'stepUsableToOutlet').rechnung).toBe('8.0 − 6.0');
    expect(find(schritte, 'stepUsableToOutlet').wert).toBe('2.0');
  });

  it('zeigt die Verteilung, aus der die Standorte folgen', () => {
    const schritte = schritteVon(flach());
    const abschnitte = Number(find(schritte, 'stepSections').wert);
    const kapazitaet = Number(find(schritte, 'stepCapacity').wert);
    const abnahme = Number(find(schritte, 'stepTotalDrop').wert);

    // Kapazität = (n−1)·6,5 + 2,0 — genau die Rechnung aus `balancedDistances`.
    expect(kapazitaet).toBeCloseTo((abschnitte - 1) * 6.5 + 2, 6);
    // Und die Auslastung ist ihr Quotient, keine zweite Größe. Auf eine
    // Nachkommastelle genau, weil `abnahme` schon gerundet aus der Zeile
    // darüber kommt — genau so liest sie auch, wer nachrechnet.
    expect(Number(find(schritte, 'stepUtilisation').wert)).toBeCloseTo(
      (abnahme / kapazitaet) * 100,
      0
    );
    expect(find(schritte, 'stepBoosterPumps').rechnung).toBe(
      `${abschnitte.toFixed(0)} − 1`
    );
    expect(Number(find(schritte, 'stepBoosterPumps').wert)).toBe(
      abschnitte - 1
    );
  });

  it('nennt die Verstärkerpumpen als das Ergebnis', () => {
    const schritte = schritteVon(flach());
    expect(schritte.filter((s) => s.ergebnis).map((s) => s.label)).toEqual([
      'stepBoosterPumps',
    ]);
  });

  it('weist den Tabellenwert als Tabelle und den gerechneten als gerechnet aus', () => {
    expect(find(schritteVon(flach()), 'stepFrictionHose').herkunft).toBe(
      'tabelle'
    );
    // Im Rohrhydraulik-Modell wird gerechnet — und dort gibt es die Kupplungen
    // als eigene Zeile, weil die Tabelle sie schon enthält und das Modell nicht.
    const modell = schritteVon(flach({ frictionModel: 'colebrook' }));
    expect(find(modell, 'stepFrictionHose').herkunft).toBe('gerechnet');
    expect(find(modell, 'stepFrictionCouplings').wert).toBeDefined();
    expect(find(modell, 'stepFrictionTotal').rechnung).toBe(
      `${find(modell, 'stepFrictionHose').wert} + ${
        find(modell, 'stepFrictionCouplings').wert
      }`
    );
    // Bei der Tabelle wäre eine Kupplungszeile eine Einladung, doppelt zu zählen.
    expect(
      schritteVon(flach()).some((s) => s.label === 'stepFrictionCouplings')
    ).toBe(false);
  });

  it('unterscheidet gemessene Höhen von der Handeingabe', () => {
    expect(find(schritteVon(flach()), 'stepElevationDifference').herkunft).toBe(
      'gemessen'
    );

    const hand = find(
      schritteVon(connection({ hoehenunterschied: 40 })),
      'stepElevationDifference'
    );
    expect(hand.herkunft).toBe('eingabe');
    expect(hand.hinweis).toBe('hintManualElevation');
    expect(hand.wert).toBe('40.0');
  });

  it('bricht ohne bekannte Dimension nach den Eingaben ab', () => {
    // Ohne Reibungswert gibt es nichts zu rechnen. Die Eingaben stehen
    // trotzdem da — sie sind der Grund, warum nicht gerechnet wird.
    const schritte = schritteVon(flach({ dimension: 'Gartenschlauch' }));
    expect(find(schritte, 'stepDimension').wert).toBe('Gartenschlauch');
    expect(schritte.some((s) => s.label === 'stepTotalDrop')).toBe(false);
    expect(schritte.some((s) => s.label === 'stepBoosterPumps')).toBe(false);
  });

  it('nennt jede Größe nur einmal', () => {
    const labels = schritteVon(flach()).map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
