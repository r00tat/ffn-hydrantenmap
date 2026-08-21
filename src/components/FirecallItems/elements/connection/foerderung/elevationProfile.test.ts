// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import {
  elevationSignature,
  elevationTodo,
  foerderungSamples,
  isElevationFallback,
  isFoerderungEnabled,
  storedElevations,
} from './elevationProfile';

const entnahme: LatLngPosition = [47.9482, 16.8482];
const verteiler: LatLngPosition = [47.9582, 16.8482];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    lat: entnahme[0],
    lng: entnahme[1],
    destLat: verteiler[0],
    destLng: verteiler[1],
    positions: JSON.stringify([entnahme, verteiler]),
    ...overrides,
  }) as Connection;

/** Eine Leitung mit gültigem, zur Lage passendem Profil. */
const withProfile = (elevations?: number[]) => {
  const item = connection({ foerderung: 'true' });
  const samples = foerderungSamples(item);
  const values = elevations ?? samples.map((_, index) => 130 + index);
  return {
    samples,
    item: connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(values),
      elevationFor: elevationSignature(samples),
    }),
    values,
  };
};

describe('isFoerderungEnabled', () => {
  it('gilt nur bei der Zeichenkette true', () => {
    expect(isFoerderungEnabled(connection({ foerderung: 'true' }))).toBe(true);
    expect(isFoerderungEnabled(connection({ foerderung: 'false' }))).toBe(false);
    expect(isFoerderungEnabled(connection())).toBe(false);
  });
});

describe('elevationSignature', () => {
  it('ändert sich mit der Länge der Leitung', () => {
    const kurz = foerderungSamples(connection());
    const lang = foerderungSamples(
      connection({ positions: JSON.stringify([entnahme, [47.98, 16.8482]]) })
    );
    expect(elevationSignature(kurz)).not.toBe(elevationSignature(lang));
  });
});

describe('storedElevations', () => {
  it('gibt die Höhen zurück, wenn sie zur Abtastung passen', () => {
    const { item, samples, values } = withProfile();
    expect(storedElevations(item, samples)).toEqual(values);
  });

  it('verwirft ein Profil mit falscher Anzahl', () => {
    const { samples } = withProfile();
    const item = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify([130, 131]),
      elevationFor: elevationSignature(samples),
    });
    expect(storedElevations(item, samples)).toBeUndefined();
  });

  it('verwirft ein Profil mit Löchern', () => {
    const { samples } = withProfile();
    const values: (number | null)[] = samples.map(() => 130);
    values[2] = null;
    const item = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(values),
      elevationFor: elevationSignature(samples),
    });
    expect(storedElevations(item, samples)).toBeUndefined();
  });

  it('verwirft ein Profil zu einer anderen Lage', () => {
    const { item } = withProfile();
    const andere = foerderungSamples(
      connection({ positions: JSON.stringify([entnahme, [47.98, 16.8482]]) })
    );
    expect(storedElevations(item, andere)).toBeUndefined();
  });

  it('verwirft unlesbares JSON', () => {
    const { samples } = withProfile();
    const item = connection({
      foerderung: 'true',
      elevationProfile: '{nope',
      elevationFor: elevationSignature(samples),
    });
    expect(storedElevations(item, samples)).toBeUndefined();
  });
});

describe('isElevationFallback', () => {
  it('gilt nur für einen Fehlschlag zur aktuellen Lage', () => {
    const samples = foerderungSamples(connection({ foerderung: 'true' }));
    const gescheitert = connection({
      foerderung: 'true',
      elevationFailed: 'true',
      elevationFor: elevationSignature(samples),
    });
    expect(isElevationFallback(gescheitert, samples)).toBe(true);

    const veraltet = connection({
      foerderung: 'true',
      elevationFailed: 'true',
      elevationFor: 'alte-signatur',
    });
    expect(isElevationFallback(veraltet, samples)).toBe(false);
  });
});

describe('elevationTodo', () => {
  it('lässt eine Leitung ohne Rechner in Ruhe', () => {
    expect(elevationTodo(connection())).toBe('none');
  });

  it('fragt ab, sobald der Rechner aktiv ist', () => {
    expect(elevationTodo(connection({ foerderung: 'true' }))).toBe('fetch');
  });

  it('lässt ein passendes Profil stehen', () => {
    const { item } = withProfile();
    expect(elevationTodo(item)).toBe('none');
  });

  it('leert die Felder nach dem Abschalten', () => {
    const { item } = withProfile();
    expect(elevationTodo({ ...item, foerderung: 'false' } as Connection)).toBe(
      'clear'
    );
  });

  it('kümmert sich nicht um andere Elementtypen', () => {
    expect(
      elevationTodo({ ...connection({ foerderung: 'true' }), type: 'line' } as any)
    ).toBe('none');
  });
});
