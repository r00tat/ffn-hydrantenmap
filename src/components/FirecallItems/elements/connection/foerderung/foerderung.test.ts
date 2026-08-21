// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import { elevationSignature, foerderungSamples } from './elevationProfile';
import {
  FOERDERUNG_DEFAULTS,
  foerderungSummary,
  foerderungView,
} from './foerderung';

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
    ...overrides,
  }) as Connection;

/** Eine Leitung mit flachem, zur Lage passendem Höhenprofil. */
const flach = (overrides: Partial<Connection> = {}) => {
  const base = connection({ foerderung: 'true', ...overrides });
  const samples = foerderungSamples(base);
  return connection({
    foerderung: 'true',
    ...overrides,
    elevationProfile: JSON.stringify(samples.map(() => 130)),
    elevationFor: elevationSignature(samples),
  });
};

describe('foerderungView', () => {
  it('gibt undefined ohne aktiven Rechner', () => {
    expect(foerderungView(connection())).toBeUndefined();
    expect(foerderungView(connection({ foerderung: 'false' }))).toBeUndefined();
  });

  it('füllt leere Felder mit den belegten Vorbelegungen', () => {
    const view = foerderungView(flach());
    expect(view?.params).toEqual(FOERDERUNG_DEFAULTS);
  });

  it('rechnet mit dem gespeicherten Profil', () => {
    const view = foerderungView(flach());
    expect(view?.elevationSource).toBe('profile');
    expect(view?.hoehenunterschied).toBeCloseTo(0, 6);
    expect(view?.warnings).not.toContain('noElevationData');
    // 1000 l/min in B 75 sind 1,50 bar je 100 m.
    expect(view?.frictionPer100m).toBeCloseTo(1.5, 6);
    expect(view?.frictionTabulated).toBe(true);
    expect(view?.result?.verstaerkerpumpen).toBeGreaterThan(0);
  });

  it('setzt für jede Pumpe eine Position auf der Leitung', () => {
    const view = foerderungView(flach());
    expect(view?.pumps).toHaveLength(view?.result?.pumps.length ?? 0);
    view?.pumps.forEach((pump) => {
      expect(Number.isFinite(pump.position[0])).toBe(true);
      expect(Number.isFinite(pump.position[1])).toBe(true);
      expect(pump.ausgangsdruck).toBe(8);
    });
    expect(view?.pumps[0].distance).toBe(0);
    expect(view?.pumps[0].eingangsdruck).toBeUndefined();
  });

  it('verteilt ohne Profil den eingegebenen Höhenunterschied linear und warnt', () => {
    const view = foerderungView(
      connection({ foerderung: 'true', hoehenunterschied: 40 })
    );
    expect(view?.elevationSource).toBe('manual');
    expect(view?.warnings).toContain('noElevationData');
    expect(view?.hoehenunterschied).toBe(40);
    // Linear verteilt: der mittlere Abtastpunkt liegt auf halber Höhe.
    const middle = view!.profile[Math.floor(view!.profile.length / 2)];
    expect(middle.elevation).toBeCloseTo(
      (40 * middle.distance) / view!.profile[view!.profile.length - 1].distance,
      6
    );
    expect(view?.result?.hoehenverlustBar).toBeCloseTo(4, 6);
  });

  it('teilt die Menge auf parallele Leitungen auf und verdoppelt den Schlauchbedarf', () => {
    const eine = foerderungView(flach({ foerderMenge: 800 }));
    const zwei = foerderungView(
      flach({ foerderMenge: 800, paralleleLeitungen: 2 })
    );
    // 800 l/min in einer Leitung: 1,00 bar/100 m. Auf zwei Leitungen je
    // 400 l/min: der 400er-Tabellenwert 0,25.
    expect(eine?.frictionPer100m).toBeCloseTo(1.0, 6);
    expect(zwei?.frictionPer100m).toBeCloseTo(0.25, 6);
    expect(zwei?.hoseCount).toBe((eine?.hoseCount ?? 0) * 2);
    expect(zwei?.result?.verstaerkerpumpen).toBeLessThan(
      eine?.result?.verstaerkerpumpen ?? 0
    );
  });

  it('rechnet nicht bei unbekannter Dimension, sondern nennt den Grund', () => {
    const view = foerderungView(flach({ dimension: 'Storz' }));
    expect(view?.warnings).toContain('unknownDimension');
    expect(view?.frictionPer100m).toBeUndefined();
    expect(view?.result).toBeUndefined();
  });

  it('kennzeichnet einen abgeleiteten Reibungswert', () => {
    const view = foerderungView(flach({ dimension: 'A' }));
    expect(view?.frictionTabulated).toBe(false);
    expect(view?.frictionPer100m).toBeDefined();
  });

  it('warnt, wenn die Fördermenge über dem Nennförderstrom liegt', () => {
    const view = foerderungView(
      flach({ foerderMenge: 1600, pumpenNennstrom: 1000 })
    );
    expect(view?.warnings).toContain('flowAbovePumpRating');
  });

  it('rechnet mit übergebenen Werten, ohne dass sie gespeichert sind', () => {
    const item = flach();
    const wenig = foerderungView(item, { foerderMenge: 400 });
    const viel = foerderungView(item, { foerderMenge: 1600 });
    expect(viel!.result!.verstaerkerpumpen).toBeGreaterThan(
      wenig!.result!.verstaerkerpumpen
    );
  });

  it('zählt den Schlauchbedarf aus Länge und Schlauchlänge', () => {
    const view = foerderungView(flach({ oneHozeLength: 20 }));
    expect(view?.hoseCount).toBe(Math.ceil(view!.length / 20));
  });
});

describe('foerderungSummary', () => {
  it('nennt Menge und Anzahl der Verstärkerpumpen', () => {
    expect(foerderungSummary(flach())).toMatch(
      /^Förderung 1000 l\/min: \d+ Verstärkerpumpen?$/
    );
  });

  it('gibt undefined ohne aktiven Rechner oder ohne Ergebnis', () => {
    expect(foerderungSummary(connection())).toBeUndefined();
    expect(foerderungSummary(flach({ dimension: 'Storz' }))).toBeUndefined();
  });

  it('nennt die Einzahl bei genau einer Verstärkerpumpe', () => {
    // 400 m bei 1000 l/min in B 75: 1,50 bar/100 m, also 0,015 bar/m. Der
    // Ausgangsdruck von 8 bar reicht nicht bis zum Ende (6,0 + 0,015 · 400 =
    // 12 bar wären nötig), eine einzige Verstärkerpumpe bei 300 m aber schon.
    const kurz: LatLngPosition = [47.9482 + 400 / 111_320, 16.8482];
    const item = connection({
      foerderung: 'true',
      positions: JSON.stringify([entnahme, kurz]),
      destLat: kurz[0],
      destLng: kurz[1],
      foerderMenge: 1000,
    });
    const samples = foerderungSamples(item);
    const withProfile = {
      ...item,
      elevationProfile: JSON.stringify(samples.map(() => 130)),
      elevationFor: elevationSignature(samples),
    } as Connection;
    const view = foerderungView(withProfile);
    expect(view?.result?.verstaerkerpumpen).toBe(1);
    expect(foerderungSummary(withProfile)).toBe(
      'Förderung 1000 l/min: 1 Verstärkerpumpe'
    );
  });
});
