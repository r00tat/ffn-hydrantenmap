// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { calculateDistance } from '../distance';
import { routingSignature } from '../routedPath';
import { DETOUR_FACTOR } from './pendelRoute';
import {
  PENDEL_DEFAULTS,
  pendelParams,
  pendelSummary,
  pendelView,
} from './pendelverkehr';

const hydrant: LatLngPosition = [47.9482, 16.8482];
const einsatzstelle: LatLngPosition = [47.9662, 16.8662];
const points: LatLngPosition[] = [hydrant, einsatzstelle];

/** Eine Fahrtroute von genau 2000 m, damit der Prüfstein greift. */
const fahrRoute: LatLngPosition[] = [
  [47.9482, 16.8482],
  [47.9482, 16.8482 + 2000 / (111320 * Math.cos((47.9482 * Math.PI) / 180))],
];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: hydrant[0],
    lng: hydrant[1],
    destLat: einsatzstelle[0],
    destLng: einsatzstelle[1],
    positions: JSON.stringify(points),
    foerderung: 'true',
    versorgungsart: 'pendel',
    ...overrides,
  }) as Connection;

const routedConnection = (overrides: Partial<Connection> = {}) =>
  connection({
    pendelRoutedPositions: JSON.stringify(fahrRoute),
    pendelRoutedFor: routingSignature([hydrant, einsatzstelle], 'drive'),
    ...overrides,
  });

describe('pendelParams', () => {
  it('füllt fehlende Werte mit den Vorbelegungen', () => {
    expect(pendelParams(connection())).toEqual(PENDEL_DEFAULTS);
  });

  it('nimmt die gespeicherten Werte, wenn sie da sind', () => {
    const params = pendelParams(
      connection({ pendelFahrzeuge: 5, pendelTankinhalt: 4000 })
    );
    expect(params.fahrzeuge).toBe(5);
    expect(params.tankinhalt).toBe(4000);
    expect(params.geschwindigkeit).toBe(PENDEL_DEFAULTS.geschwindigkeit);
  });

  it('lässt keine halben Fahrzeuge und keine Null zu', () => {
    expect(pendelParams(connection({ pendelFahrzeuge: 2.6 })).fahrzeuge).toBe(3);
    expect(pendelParams(connection({ pendelFahrzeuge: 0 })).fahrzeuge).toBe(1);
    expect(pendelParams(connection({ pendelFahrzeuge: -4 })).fahrzeuge).toBe(1);
  });
});

describe('pendelView', () => {
  it('rechnet nicht, solange nur die Förderung gewählt ist', () => {
    expect(
      pendelView(connection({ versorgungsart: 'foerderung' }))
    ).toBeUndefined();
  });

  it('rechnet auch für den Vergleich', () => {
    expect(pendelView(connection({ versorgungsart: 'vergleich' }))).toBeDefined();
  });

  it('rechnet nicht ohne eingeschalteten Rechner', () => {
    expect(pendelView(connection({ foerderung: 'false' }))).toBeUndefined();
  });

  it('nimmt die Länge der Fahrtroute, nicht die der Leitung', () => {
    const view = pendelView(routedConnection());
    expect(view?.streckeSource).toBe('route');
    // Auf wenige Meter: Die Testroute ist über die Näherung „Grad je Meter"
    // gesetzt, Leaflet misst auf dem Ellipsoid.
    expect(view?.strecke).toBeGreaterThan(1990);
    expect(view?.strecke).toBeLessThan(2010);
    // Die Leitung selbst ist deutlich länger.
    expect(calculateDistance(points)).toBeGreaterThan(2200);
  });

  it('trifft den Prüfstein: 13 min Umlauf, 153,8 l/min mit einem Fahrzeug', () => {
    const view = pendelView(
      routedConnection({
        pendelFahrzeuge: 1,
        pendelTankinhalt: 2000,
        pendelGeschwindigkeit: 40,
        pendelFuellzeit: 4,
        pendelEntleerzeit: 3,
      })
    );
    expect(view?.result?.umlaufzeit).toBeCloseTo(13, 1);
    expect(view?.result?.menge).toBeCloseTo(153.8, 0);
  });

  it('weist die Luftlinienschätzung als solche aus', () => {
    const view = pendelView(connection());
    expect(view?.streckeSource).toBe('detour');
    expect(view?.strecke).toBeCloseTo(
      calculateDistance(points) * DETOUR_FACTOR,
      6
    );
    expect(view?.warnings).toContain('estimatedDistance');
  });

  it('warnt, wenn die Füllstelle die Menge deckelt', () => {
    const view = pendelView(
      routedConnection({
        pendelFahrzeuge: 8,
        pendelTankinhalt: 2000,
        pendelGeschwindigkeit: 40,
        pendelFuellzeit: 4,
        pendelEntleerzeit: 3,
      })
    );
    expect(view?.warnings).toContain('fillStationLimited');
    expect(view?.result?.menge).toBeCloseTo(500, 6);
  });

  it('warnt, wenn die Sollmenge nicht getragen wird', () => {
    const view = pendelView(routedConnection({ foerderMenge: 1000 }));
    expect(view?.warnings).toContain('sollMengeNotReached');
  });

  it('nimmt die Sollmenge aus der Fördermenge — dieselbe Zahl für beide Varianten', () => {
    expect(pendelView(routedConnection({ foerderMenge: 600 }))?.sollMenge).toBe(
      600
    );
  });

  it('lässt den Regler mit Überschreibungen rechnen, ohne zu speichern', () => {
    const item = routedConnection({ pendelFahrzeuge: 1 });
    const view = pendelView(item, { fahrzeuge: 4 });
    expect(view?.params.fahrzeuge).toBe(4);
    // Das Element bleibt unberührt.
    expect(item.pendelFahrzeuge).toBe(1);
  });

  it('gibt die Fahrtroute für die Karte weiter', () => {
    expect(pendelView(routedConnection())?.routedPositions).toEqual(fahrRoute);
    expect(pendelView(connection())?.routedPositions).toBeUndefined();
  });
});

describe('pendelSummary', () => {
  it('nennt Fahrzeuge und Menge', () => {
    const summary = pendelSummary(
      routedConnection({
        pendelFahrzeuge: 3,
        pendelTankinhalt: 2000,
        pendelGeschwindigkeit: 40,
        pendelFuellzeit: 4,
        pendelEntleerzeit: 3,
      })
    );
    expect(summary).toMatch(/3/);
    expect(summary).toMatch(/46[12]/);
  });

  it('schweigt ohne Ergebnis', () => {
    expect(
      pendelSummary(connection({ versorgungsart: 'foerderung' }))
    ).toBeUndefined();
  });
});
