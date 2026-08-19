import { describe, expect, it } from 'vitest';
import { GeohashCluster } from './gis-objects';
import {
  buildHoseLineDraft,
  collectWaterSupplyCandidates,
  compassDirection,
  describeHoseLineDraft,
  describeWaterSupplyCandidate,
  hoseLineDraftLabel,
  hoseLineDraftMidpoint,
  hoseSectionCount,
  WATER_SUPPLY_KINDS,
} from './waterSupply';

const einsatzort = { lat: 47.9482913, lng: 16.848222 };

/** ~1 m in latitude degrees, good enough to place fixtures at known distances */
const metersToLat = (m: number) => m / 111320;

function cluster(overrides: Partial<GeohashCluster>): GeohashCluster {
  return { geohash: 'u2m0xx', ...overrides } as GeohashCluster;
}

describe('collectWaterSupplyCandidates', () => {
  it('returns hydrants sorted by air line distance', () => {
    const clusters = [
      cluster({
        hydranten: [
          {
            name: 'H-fern',
            lat: einsatzort.lat + metersToLat(200),
            lng: einsatzort.lng,
            typ: 'Überflurhydrant',
            dimension: 100,
          },
          {
            name: 'H-nah',
            lat: einsatzort.lat + metersToLat(50),
            lng: einsatzort.lng,
            typ: 'Unterflurhydrant',
            dimension: 80,
          },
        ] as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
    });

    expect(result.map((c) => c.name)).toEqual(['H-nah', 'H-fern']);
    expect(result[0].distance).toBeGreaterThan(45);
    expect(result[0].distance).toBeLessThan(55);
    expect(result[0].kind).toBe('hydrant');
    expect(result[0].typ).toBe('Unterflurhydrant');
  });

  it('drops candidates outside the radius', () => {
    const clusters = [
      cluster({
        hydranten: [
          { name: 'H-drin', lat: einsatzort.lat + metersToLat(90), lng: einsatzort.lng },
          { name: 'H-draussen', lat: einsatzort.lat + metersToLat(400), lng: einsatzort.lng },
        ] as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 100,
    });

    expect(result.map((c) => c.name)).toEqual(['H-drin']);
  });

  it('collects Saugstellen and Löschteiche with their capacity data', () => {
    const clusters = [
      cluster({
        saugstelle: [
          {
            name: 'Saugstelle See',
            lat: einsatzort.lat + metersToLat(120),
            lng: einsatzort.lng,
            wasserentnahme_l_min_: 1600,
            geod_tische_saugh_he_m_: 3.5,
          },
        ] as any,
        loeschteich: [
          {
            name: 'Löschteich Nord',
            lat: einsatzort.lat + metersToLat(80),
            lng: einsatzort.lng,
            fassungsverm_gen_m3_: 250,
            zufluss_l_min_: 120,
          },
        ] as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
    });

    expect(result.map((c) => c.kind)).toEqual(['loeschteich', 'saugstelle']);
    expect(result[0].fassungsvermoegen).toBe(250);
    expect(result[0].zufluss).toBe(120);
    expect(result[1].wasserentnahme).toBe(1600);
    expect(result[1].saughoehe).toBe(3.5);
  });

  it('filters by kind', () => {
    const clusters = [
      cluster({
        hydranten: [{ name: 'H1', lat: einsatzort.lat, lng: einsatzort.lng }] as any,
        saugstelle: [
          { name: 'S1', lat: einsatzort.lat, lng: einsatzort.lng },
        ] as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
      kinds: ['saugstelle'],
    });

    expect(result.map((c) => c.name)).toEqual(['S1']);
  });

  it('filters hydrants by type substring, case insensitive', () => {
    const clusters = [
      cluster({
        hydranten: [
          { name: 'ÜH', lat: einsatzort.lat, lng: einsatzort.lng, typ: 'Überflurhydrant' },
          {
            name: 'UH',
            lat: einsatzort.lat + metersToLat(10),
            lng: einsatzort.lng,
            typ: 'Unterflurhydrant',
          },
        ] as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
      hydrantType: 'überflur',
    });

    expect(result.map((c) => c.name)).toEqual(['ÜH']);
  });

  it('limits the number of results', () => {
    const clusters = [
      cluster({
        hydranten: Array.from({ length: 20 }, (_, i) => ({
          name: `H${i}`,
          lat: einsatzort.lat + metersToLat(10 * (i + 1)),
          lng: einsatzort.lng,
        })) as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
      limit: 3,
    });

    expect(result.map((c) => c.name)).toEqual(['H0', 'H1', 'H2']);
  });

  it('deduplicates records that appear in several geohash clusters', () => {
    const hydrant = { name: 'H1', lat: einsatzort.lat, lng: einsatzort.lng };
    const clusters = [
      cluster({ geohash: 'a', hydranten: [hydrant] as any }),
      cluster({ geohash: 'b', hydranten: [hydrant] as any }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
    });

    expect(result).toHaveLength(1);
  });

  it('ignores records without usable coordinates', () => {
    const clusters = [
      cluster({
        hydranten: [
          { name: 'kaputt', lat: undefined, lng: undefined },
          { name: 'ok', lat: einsatzort.lat, lng: einsatzort.lng },
        ] as any,
      }),
    ];

    const result = collectWaterSupplyCandidates(clusters, einsatzort, {
      radius: 500,
    });

    expect(result.map((c) => c.name)).toEqual(['ok']);
  });

  it('tolerates clusters without any water supply records', () => {
    expect(
      collectWaterSupplyCandidates([cluster({})], einsatzort, { radius: 500 })
    ).toEqual([]);
  });

  it('knows all three water supply kinds', () => {
    expect(WATER_SUPPLY_KINDS).toEqual(['hydrant', 'saugstelle', 'loeschteich']);
  });
});

describe('hoseSectionCount', () => {
  it('rounds up to full hose sections', () => {
    expect(hoseSectionCount(0, 20)).toBe(0);
    expect(hoseSectionCount(1, 20)).toBe(1);
    expect(hoseSectionCount(40, 20)).toBe(2);
    expect(hoseSectionCount(41, 20)).toBe(3);
  });

  it('falls back to 20 m sections for invalid lengths', () => {
    expect(hoseSectionCount(60, 0)).toBe(3);
    expect(hoseSectionCount(60, -5)).toBe(3);
  });
});

describe('buildHoseLineDraft', () => {
  const source = {
    kind: 'hydrant' as const,
    name: 'ÜH Hauptstraße 12',
    lat: einsatzort.lat + metersToLat(90),
    lng: einsatzort.lng,
    distance: 90,
  };

  it('gives every draft a stable id derived from its source', () => {
    const a = buildHoseLineDraft({ source, target: einsatzort });
    const b = buildHoseLineDraft({ source, target: einsatzort });
    const other = buildHoseLineDraft({
      source: { ...source, name: 'UH Seegasse 3' },
      target: einsatzort,
    });

    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(other.id);
    expect(a.id).toBeTruthy();
  });

  it('distinguishes drafts of different dimension from the same source', () => {
    const b = buildHoseLineDraft({ source, target: einsatzort });
    const c = buildHoseLineDraft({ source, target: einsatzort, dimension: 'C' });
    expect(b.id).not.toBe(c.id);
  });

  it('builds a straight draft from source to target', () => {
    const draft = buildHoseLineDraft({ source, target: einsatzort });

    expect(draft.positions).toEqual([
      [source.lat, source.lng],
      [einsatzort.lat, einsatzort.lng],
    ]);
    expect(draft.distance).toBeGreaterThan(85);
    expect(draft.distance).toBeLessThan(95);
    expect(draft.dimension).toBe('B');
    expect(draft.oneHozeLength).toBe(20);
    expect(draft.hoseCount).toBe(5);
    expect(draft.source).toEqual({ kind: 'hydrant', name: 'ÜH Hauptstraße 12' });
  });

  it('names the draft after the source when no name is given', () => {
    expect(buildHoseLineDraft({ source, target: einsatzort }).name).toBe(
      'B-Leitung ÜH Hauptstraße 12'
    );
  });

  it('keeps an explicit name and dimension', () => {
    const draft = buildHoseLineDraft({
      source,
      target: einsatzort,
      dimension: 'C',
      name: 'Angriffsleitung',
      oneHozeLength: 15,
      reason: 'nächster Hydrant',
    });

    expect(draft.name).toBe('Angriffsleitung');
    expect(draft.dimension).toBe('C');
    expect(draft.oneHozeLength).toBe(15);
    expect(draft.hoseCount).toBe(6);
    expect(draft.reason).toBe('nächster Hydrant');
  });

  it('routes through intermediate waypoints and sums their distances', () => {
    const via = { lat: einsatzort.lat + metersToLat(90), lng: einsatzort.lng + 0.001 };
    const draft = buildHoseLineDraft({ source, target: einsatzort, via: [via] });

    expect(draft.positions).toHaveLength(3);
    expect(draft.distance).toBeGreaterThan(90);
  });

  it('describes itself in German for the toast and the model', () => {
    const draft = buildHoseLineDraft({ source, target: einsatzort });
    expect(describeHoseLineDraft(draft)).toBe(
      'B-Leitung ÜH Hauptstraße 12: 90 m, 5 B-Längen'
    );
  });

  it('carries a short label for the map, without the name', () => {
    // Auf der Karte steht der Name schon am Hydranten; das Etikett an der
    // Linie hat nur Platz für das, was man im Einsatz braucht.
    const draft = buildHoseLineDraft({ source, target: einsatzort });
    expect(hoseLineDraftLabel(draft)).toBe('90 m · 5 × B');
  });

  it('finds the midpoint of the line for the label', () => {
    const draft = buildHoseLineDraft({ source, target: einsatzort });
    const [lat, lng] = hoseLineDraftMidpoint(draft);
    expect(lat).toBeCloseTo((source.lat + einsatzort.lat) / 2, 6);
    expect(lng).toBeCloseTo(einsatzort.lng, 6);
  });

  it('puts the label on the longest segment of a routed line', () => {
    const via = { lat: einsatzort.lat + metersToLat(45), lng: einsatzort.lng };
    const draft = buildHoseLineDraft({
      source: { ...source, lat: einsatzort.lat + metersToLat(400) },
      target: einsatzort,
      via: [via],
    });
    const [lat] = hoseLineDraftMidpoint(draft);
    // Das lange Stück liegt zwischen Quelle (400 m) und Zwischenpunkt (45 m).
    expect(lat).toBeCloseTo(einsatzort.lat + metersToLat(222.5), 5);
  });
});

describe('compassDirection', () => {
  const from = { lat: 47.9482913, lng: 16.848222 };
  const at = (dLat: number, dLng: number) => ({
    lat: from.lat + dLat / 111320,
    lng: from.lng + dLng / (111320 * Math.cos((from.lat * Math.PI) / 180)),
  });

  it('names the eight compass directions in German', () => {
    expect(compassDirection(from, at(100, 0))).toBe('nördlich');
    expect(compassDirection(from, at(100, 100))).toBe('nordöstlich');
    expect(compassDirection(from, at(0, 100))).toBe('östlich');
    expect(compassDirection(from, at(-100, 100))).toBe('südöstlich');
    expect(compassDirection(from, at(-100, 0))).toBe('südlich');
    expect(compassDirection(from, at(-100, -100))).toBe('südwestlich');
    expect(compassDirection(from, at(0, -100))).toBe('westlich');
    expect(compassDirection(from, at(100, -100))).toBe('nordwestlich');
  });

  it('has no direction for the same point', () => {
    expect(compassDirection(from, from)).toBeUndefined();
  });
});

describe('describeWaterSupplyCandidate', () => {
  const from = { lat: 47.9482913, lng: 16.848222 };

  it('describes a hydrant with distance, direction and capacity', () => {
    const candidate = collectWaterSupplyCandidates(
      [
        {
          geohash: 'a',
          hydranten: [
            {
              name: 'ÖH 12',
              lat: from.lat + metersToLat(120),
              lng: from.lng,
              typ: 'Überflurhydrant',
              dimension: 100,
              statischer_druck: 6,
              adresse: 'Hauptstraße 12',
            },
          ],
        } as any,
      ],
      from,
      { radius: 500 }
    )[0];

    expect(describeWaterSupplyCandidate(candidate, from)).toBe(
      'Überflurhydrant ÖH 12 (Hauptstraße 12), 120 m nördlich, 100 mm, 6 bar statisch'
    );
  });

  it('falls back to the generic label when the record has no type', () => {
    const candidate = collectWaterSupplyCandidates(
      [
        {
          geohash: 'a',
          saugstelle: [
            {
              name: 'Seeufer',
              lat: from.lat,
              lng: from.lng - 0.002,
              wasserentnahme_l_min_: 1600,
            },
          ],
        } as any,
      ],
      from,
      { radius: 500 }
    )[0];

    expect(describeWaterSupplyCandidate(candidate, from)).toBe(
      'Saugstelle Seeufer, 149 m westlich, 1600 l/min'
    );
  });
});
