import { describe, expect, it } from 'vitest';
import {
  extractPointCoordinates,
  formatOutageTime,
  isValidLatLng,
  parsePowerOutageResponse,
} from './powerOutageUtils';

/** Mischendorf/Burgenland in EPSG:3857 */
const X = 1817488.89404;
const Y = 5974724.47347;

function feature(overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature',
    _id: '306821-819650',
    geometry: {
      type: 'OrientedPoint',
      coordinates: [
        [X, Y],
        [1, 0.00012],
      ],
    },
    properties: {
      NETZ: '20-kV-Netz Burgenland',
      ANLASS: 'Geplante Schaltung mit Versorgungsunterbrechung',
      AUSFALL_BEGINN: '12.08.2026, 14:30:00',
      AUSFALL_ENDE: '12.08.2026, 15:15:00',
      NETZBEZIRK: 'Oberwart',
      NETZGEMEINDE: 'Mischendorf',
      STATION_BEZEICHNUNG: 'Mühle',
      STATION_NUMMER: 549005.0,
    },
    ...overrides,
  };
}

function collection(features: unknown[]) {
  return { type: 'FeatureCollection', features };
}

describe('extractPointCoordinates', () => {
  it('reads a flat Point coordinate pair', () => {
    expect(extractPointCoordinates([X, Y])).toEqual([X, Y]);
  });

  it('reads the position from a nested OrientedPoint coordinate pair', () => {
    expect(
      extractPointCoordinates([
        [X, Y],
        [1, 0.00012],
      ])
    ).toEqual([X, Y]);
  });

  it('returns null for missing, short or non-numeric coordinates', () => {
    expect(extractPointCoordinates(undefined)).toBeNull();
    expect(extractPointCoordinates([])).toBeNull();
    expect(extractPointCoordinates([X])).toBeNull();
    expect(extractPointCoordinates([[X]])).toBeNull();
    expect(extractPointCoordinates(['a', 'b'])).toBeNull();
    expect(extractPointCoordinates([X, null])).toBeNull();
    expect(extractPointCoordinates([Number.NaN, Y])).toBeNull();
    expect(extractPointCoordinates('nope')).toBeNull();
  });
});

describe('isValidLatLng', () => {
  it('accepts coordinates inside the WGS84 range', () => {
    expect(isValidLatLng(47.13, 16.32)).toBe(true);
  });

  it('rejects NaN, Infinity and out-of-range coordinates', () => {
    expect(isValidLatLng(Number.NaN, Number.NaN)).toBe(false);
    expect(isValidLatLng(47.13, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidLatLng(95, 16.32)).toBe(false);
    expect(isValidLatLng(47.13, 200)).toBe(false);
  });
});

describe('parsePowerOutageResponse', () => {
  it('converts an OrientedPoint feature to WGS84 coordinates', () => {
    const [outage] = parsePowerOutageResponse(collection([feature()]));

    expect(outage.id).toBe('306821-819650');
    // Trafostation in Mischendorf/Burgenland
    expect(outage.lat).toBeCloseTo(47.1997, 3);
    expect(outage.lng).toBeCloseTo(16.3268, 3);
    expect(outage.netzgemeinde).toBe('Mischendorf');
    expect(outage.stationBezeichnung).toBe('Mühle');
  });

  it('coerces non-string properties such as STATION_NUMMER', () => {
    const [outage] = parsePowerOutageResponse(collection([feature()]));

    expect(outage.stationNummer).toBe('549005');
  });

  it('defaults missing properties to empty strings', () => {
    const [outage] = parsePowerOutageResponse(
      collection([feature({ properties: {} })])
    );

    expect(outage.netz).toBe('');
    expect(outage.anlass).toBe('');
    expect(outage.ausfallBeginn).toBe('');
    expect(outage.ausfallEnde).toBe('');
  });

  it('skips features whose coordinates cannot be resolved', () => {
    const broken = [
      feature({ geometry: undefined }),
      feature({ geometry: { type: 'Point', coordinates: [] } }),
      feature({ geometry: { type: 'Polygon', coordinates: [[[X, Y]]] } }),
      feature({ geometry: { type: 'Point', coordinates: ['x', 'y'] } }),
    ];

    expect(parsePowerOutageResponse(collection(broken))).toEqual([]);
  });

  it('never returns markers with NaN coordinates', () => {
    const outages = parsePowerOutageResponse(
      collection([feature(), feature({ geometry: undefined })])
    );

    expect(outages).toHaveLength(1);
    for (const outage of outages) {
      expect(Number.isFinite(outage.lat)).toBe(true);
      expect(Number.isFinite(outage.lng)).toBe(true);
    }
  });

  it('skips features without a usable id', () => {
    expect(parsePowerOutageResponse(collection([feature({ _id: undefined })])))
      .toEqual([]);
  });

  it('returns an empty list for unexpected payloads', () => {
    expect(parsePowerOutageResponse(undefined)).toEqual([]);
    expect(parsePowerOutageResponse(null)).toEqual([]);
    expect(parsePowerOutageResponse('nope')).toEqual([]);
    expect(parsePowerOutageResponse({})).toEqual([]);
    expect(parsePowerOutageResponse({ type: 'Feature' })).toEqual([]);
    expect(
      parsePowerOutageResponse({ type: 'FeatureCollection', features: {} })
    ).toEqual([]);
  });

  it('ignores individual features that are not objects', () => {
    const outages = parsePowerOutageResponse(
      collection([null, 'x', 42, feature()])
    );

    expect(outages).toHaveLength(1);
  });
});

describe('formatOutageTime', () => {
  it('passes a real timestamp through', () => {
    expect(formatOutageTime('12.08.2026, 14:30:00')).toBe('12.08.2026, 14:30:00');
  });

  it('hides the "open end" placeholder and empty values', () => {
    expect(formatOutageTime('31.12.2099, 23:59:00')).toBe('');
    expect(formatOutageTime('')).toBe('');
  });
});
