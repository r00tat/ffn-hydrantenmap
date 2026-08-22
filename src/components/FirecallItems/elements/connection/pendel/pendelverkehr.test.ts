// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { calculateDistance } from '../distance';
import { routingSignature } from '../routedPath';
import type { Fuellstelle } from './fuellstelle';
import {
  PENDEL_DEFAULTS,
  pendelParams,
  pendelSummary,
  pendelView,
} from './pendelverkehr';

const hydrant: LatLngPosition = [47.9482, 16.8482];
/** Rund 2000 m östlich — damit greift der Prüfstein aus `shuttle.test.ts`. */
const einsatzstelle: LatLngPosition = [
  47.9482,
  16.8482 + 2000 / (111_320 * Math.cos((47.9482 * Math.PI) / 180)),
];
const points: LatLngPosition[] = [hydrant, einsatzstelle];

const fuellstelle: Fuellstelle = {
  name: 'HY-12 Hauptstraße',
  distance: 25,
  leistung: 800,
};

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

/** Dieselbe Leitung, auf Fahrzeug-Routing gestellt. */
const routed = (overrides: Partial<Connection> = {}) =>
  connection({
    streetRouting: 'true',
    routingProfile: 'drive',
    routedPositions: JSON.stringify(points),
    routedFor: routingSignature(points, 'drive'),
    ...overrides,
  });

describe('pendelParams', () => {
  it('füllt fehlende Werte mit den Vorbelegungen', () => {
    const params = pendelParams(connection());
    expect(params.fahrzeuge).toBe(PENDEL_DEFAULTS.fahrzeuge);
    expect(params.tankinhalt).toBe(PENDEL_DEFAULTS.tankinhalt);
    expect(params.geschwindigkeit).toBe(PENDEL_DEFAULTS.geschwindigkeit);
    expect(params.rangierzeit).toBe(PENDEL_DEFAULTS.rangierzeit);
    expect(params.entleerzeit).toBe(PENDEL_DEFAULTS.entleerzeit);
  });

  it('hat für die Ergiebigkeit **keine** Vorbelegung', () => {
    // Der Kern der Sache: Eine feste Füllzeit war stillschweigend eine
    // behauptete Literleistung. Ohne Datenlage wird gefragt, nicht geraten.
    expect(pendelParams(connection()).fuellleistung).toBeUndefined();
    expect('fuellleistung' in PENDEL_DEFAULTS).toBe(false);
  });

  it('nimmt die Ergiebigkeit aus dem Hydranten in der Nähe', () => {
    expect(pendelParams(connection(), fuellstelle).fuellleistung).toBe(800);
  });

  it('lässt den eingetragenen Wert gegen den Hydranten gewinnen', () => {
    // Wer ihn von Hand gesetzt hat, hat einen Grund — gemessen, oder ein
    // anderer Anschluss als der, den die GIS-Daten kennen.
    expect(
      pendelParams(connection({ pendelFuellleistung: 1200 }), fuellstelle)
        .fuellleistung
    ).toBe(1200);
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
    expect(
      pendelView(connection({ versorgungsart: 'vergleich' }), {}, undefined, fuellstelle)
    ).toBeDefined();
  });

  it('rechnet nicht ohne eingeschalteten Rechner', () => {
    expect(pendelView(connection({ foerderung: 'false' }))).toBeUndefined();
  });

  it('trifft den Prüfstein mit der Ergiebigkeit des Hydranten', () => {
    // 2000 m, 40 km/h, 2000 l, 800 l/min, 1 min Rangieren, 3 min Entleeren
    // ⇒ Füllzeit 3,5 min, Umlauf 12,5 min, ein Fahrzeug 160 l/min.
    const view = pendelView(
      routed({ pendelFahrzeuge: 1 }),
      {},
      undefined,
      fuellstelle
    );
    expect(view?.result?.fuellzeit).toBeCloseTo(3.5, 1);
    expect(view?.result?.umlaufzeit).toBeCloseTo(12.5, 1);
    expect(view?.result?.menge).toBeCloseTo(160, 0);
  });

  it('nennt den Hydranten als Quelle der Ergiebigkeit', () => {
    const view = pendelView(routed(), {}, undefined, fuellstelle);
    expect(view?.fuellleistungSource).toBe('hydrant');
    expect(view?.fuellstelle?.name).toBe('HY-12 Hauptstraße');
  });

  it('nennt eine eingetragene Ergiebigkeit als Handeingabe', () => {
    const view = pendelView(
      routed({ pendelFuellleistung: 1200 }),
      {},
      undefined,
      fuellstelle
    );
    expect(view?.fuellleistungSource).toBe('manual');
  });

  it('rechnet ohne Ergiebigkeit nicht und sagt genau das', () => {
    const view = pendelView(routed());
    expect(view?.fuellleistungSource).toBe('unknown');
    expect(view?.warnings).toContain('fillRateMissing');
    expect(view?.result).toBeUndefined();
    // Keine zweite Meldung über dasselbe.
    expect(view?.warnings).not.toContain('notComputable');
  });

  it('misst die Fahrstrecke an der gerouteten Leitung', () => {
    const view = pendelView(routed(), {}, undefined, fuellstelle);
    expect(view?.streckeSource).toBe('route');
    expect(view?.strecke).toBeCloseTo(calculateDistance(points), 6);
    expect(view?.warnings).not.toContain('notVehicleRouted');
  });

  it('weist die gezeichnete Linie als solche aus', () => {
    const view = pendelView(connection(), {}, undefined, fuellstelle);
    expect(view?.streckeSource).toBe('drawn');
    expect(view?.warnings).toContain('notVehicleRouted');
    // Gerechnet wird trotzdem — die gezeichnete Strecke ist eine Auskunft.
    expect(view?.result).toBeDefined();
  });

  it('warnt, wenn die Entnahmestelle die Menge deckelt', () => {
    const view = pendelView(
      routed({ pendelFahrzeuge: 8 }),
      {},
      undefined,
      fuellstelle
    );
    expect(view?.warnings).toContain('fillStationLimited');
    expect(view?.result?.menge).toBeCloseTo(2000 / 3.5, 1);
  });

  it('warnt, wenn die Sollmenge nicht getragen wird', () => {
    const view = pendelView(
      routed({ foerderMenge: 1000 }),
      {},
      undefined,
      fuellstelle
    );
    expect(view?.warnings).toContain('sollMengeNotReached');
  });

  it('nimmt die Sollmenge aus der Fördermenge', () => {
    expect(
      pendelView(routed({ foerderMenge: 600 }), {}, undefined, fuellstelle)
        ?.sollMenge
    ).toBe(600);
  });

  it('lässt den Regler mit Überschreibungen rechnen, ohne zu speichern', () => {
    const item = routed({ pendelFahrzeuge: 1 });
    const view = pendelView(item, { fahrzeuge: 4 }, undefined, fuellstelle);
    expect(view?.params.fahrzeuge).toBe(4);
    expect(item.pendelFahrzeuge).toBe(1);
  });
});

describe('pendelSummary', () => {
  it('nennt Fahrzeuge und Menge', () => {
    const summary = pendelSummary(routed({ pendelFahrzeuge: 3 }), fuellstelle);
    expect(summary).toMatch(/3 Fz/);
    expect(summary).toMatch(/l\/min/);
  });

  it('schweigt ohne Ergiebigkeit', () => {
    expect(pendelSummary(routed())).toBeUndefined();
  });

  it('schweigt ohne Pendelverkehr', () => {
    expect(
      pendelSummary(connection({ versorgungsart: 'foerderung' }), fuellstelle)
    ).toBeUndefined();
  });
});
