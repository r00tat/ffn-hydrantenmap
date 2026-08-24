// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import type { Connection } from '../../../../firebase/firestore';
import {
  elevationSignature,
  elevationTodo,
  FALLBACK_SAMPLE_SPACING_M,
  foerderungSamples,
  isElevationFallback,
  isFoerderungEnabled,
  storedElevations,
} from './elevationProfile';
import { FALLBACK_SAMPLING, FINE_SAMPLING } from './elevationSampling';

/** Signatur zur gewünschten, feinen Abtastung. */
const signature = (samples: Parameters<typeof elevationSignature>[0]) =>
  elevationSignature(samples, FINE_SAMPLING.spacingM);

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

/** Eine Leitung mit gültigem, zur Lage passendem Profil aus dem eigenen Modell. */
const withProfile = (elevations?: number[]) => {
  const item = connection({ foerderung: 'true' });
  const samples = foerderungSamples(item);
  const values = elevations ?? samples.map((_, index) => 130 + index);
  return {
    samples,
    item: connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(values),
      elevationFor: signature(samples),
      elevationSpacing: String(FINE_SAMPLING.spacingM),
      elevationSource: 'terrain',
      elevationLevel: 'detail',
    }),
    values,
  };
};

/**
 * Dieselbe Leitung mit einem Profil aus der Rückfallebene: grobe Abtastung,
 * kein `elevationSpacing` — so sind alle Profile entstanden, die es vor dem
 * eigenen Höhenmodell gab.
 */
const withLegacyProfile = () => {
  const item = connection({ foerderung: 'true' });
  const samples = foerderungSamples(item, FALLBACK_SAMPLING);
  return {
    samples,
    item: connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(samples.map(() => 200)),
      elevationFor: elevationSignature(samples, FALLBACK_SAMPLE_SPACING_M),
    }),
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
    expect(signature(kurz)).not.toBe(signature(lang));
  });
});

describe('storedElevations', () => {
  it('gibt die Höhen zurück, wenn sie zur Abtastung passen', () => {
    const { item, samples, values } = withProfile();
    expect(storedElevations(item)?.elevations).toEqual(values);
    expect(storedElevations(item)?.spacingM).toBe(FINE_SAMPLING.spacingM);
    expect(storedElevations(item)?.source).toBe('terrain');
  });

  it('verwirft ein Profil mit falscher Anzahl', () => {
    const { samples } = withProfile();
    const item = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify([130, 131]),
      elevationFor: signature(samples),
    });
    expect(storedElevations(item)).toBeUndefined();
  });

  it('verwirft ein Profil mit Löchern', () => {
    const { samples } = withProfile();
    const values: (number | null)[] = samples.map(() => 130);
    values[2] = null;
    const item = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(values),
      elevationFor: signature(samples),
    });
    expect(storedElevations(item)).toBeUndefined();
  });

  it('verwirft ein Profil zu einer anderen Lage', () => {
    const { samples } = withProfile();
    // Dieselben Höhen, aber die Signatur einer längeren Leitung.
    const item = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(samples.map(() => 130)),
      elevationFor: signature(
        foerderungSamples(
          connection({
            positions: JSON.stringify([entnahme, [47.98, 16.8482]]),
          })
        )
      ),
    });
    expect(storedElevations(item)).toBeUndefined();
  });

  it('verwirft ein Profil mit anderer Abtastweite', () => {
    const { samples } = withProfile();
    const item = connection({
      foerderung: 'true',
      elevationProfile: JSON.stringify(samples.map(() => 130)),
      // Die Signatur gilt für 10 m, das Feld behauptet 50 m.
      elevationFor: signature(samples),
      elevationSpacing: String(FALLBACK_SAMPLE_SPACING_M),
    });
    expect(storedElevations(item)).toBeUndefined();
  });

  it('unterscheidet Signaturen nach der Abtastweite', () => {
    const item = connection({ foerderung: 'true' });
    const fein = foerderungSamples(item, FINE_SAMPLING);
    const grob = foerderungSamples(item, FALLBACK_SAMPLING);
    expect(
      elevationSignature(fein, FINE_SAMPLING.spacingM)
    ).not.toBe(elevationSignature(grob, FALLBACK_SAMPLE_SPACING_M));
    // Auch bei gleichen Punkten: dieselben Koordinaten mit anderer Weite sind
    // ein anderes Profil.
    expect(elevationSignature(fein, 10)).not.toBe(
      elevationSignature(fein, 50)
    );
  });

  it('erkennt ein Profil aus der Rückfallebene als gültig', () => {
    // Ohne `elevationSpacing` gilt 50 m, und die Punkte werden mit **dieser**
    // Weite nachgebildet. Sonst passte die gewünschte feine Abtastung nie zur
    // gespeicherten groben und die Karte fragte bei jedem Render neu ab.
    const { item } = withLegacyProfile();
    expect(storedElevations(item)?.source).toBe('opentopodata');
    expect(storedElevations(item)?.spacingM).toBe(FALLBACK_SAMPLE_SPACING_M);
    expect(elevationTodo(item)).toBe('none');
  });

  it('führt Quelle und Stufe des eigenen Modells mit', () => {
    const { item } = withProfile();
    expect(storedElevations(item)?.source).toBe('terrain');
    expect(storedElevations(item)?.level).toBe('detail');
  });

  it('tastet feiner ab als die Rückfallebene', () => {
    // Der Sinn des feineren Rasters: mehr Stützpunkte auf derselben Leitung.
    expect(withProfile().samples.length).toBeGreaterThan(
      withLegacyProfile().samples.length
    );
  });

  it('verwirft unlesbares JSON', () => {
    const { samples } = withProfile();
    const item = connection({
      foerderung: 'true',
      elevationProfile: '{nope',
      elevationFor: signature(samples),
    });
    expect(storedElevations(item)).toBeUndefined();
  });
});

describe('isElevationFallback', () => {
  it('gilt nur für einen Fehlschlag zur aktuellen Lage', () => {
    // Ein Fehlschlag hält die Signatur des letzten Versuchs fest, und das ist
    // die Rückfallebene mit ihrer groben Abtastung.
    const samples = foerderungSamples(
      connection({ foerderung: 'true' }),
      FALLBACK_SAMPLING
    );
    const gescheitert = connection({
      foerderung: 'true',
      elevationFailed: 'true',
      elevationFor: elevationSignature(samples, FALLBACK_SAMPLE_SPACING_M),
      elevationSpacing: String(FALLBACK_SAMPLE_SPACING_M),
    });
    expect(isElevationFallback(gescheitert)).toBe(true);

    const veraltet = connection({
      foerderung: 'true',
      elevationFailed: 'true',
      elevationFor: 'alte-signatur',
    });
    expect(isElevationFallback(veraltet)).toBe(false);
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
