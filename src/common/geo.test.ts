import { describe, it, expect } from 'vitest';
import {
  GeoPosition,
  defaultLatLngPosition,
  GeoJsonToLatLng,
  LatLngToGeoJson,
  latLngPosition,
} from './geo';

describe('GeoPosition', () => {
  describe('constructor', () => {
    it('uses provided lat/lng', () => {
      const p = new GeoPosition(48.0, 16.5);
      expect(p.lat).toBe(48.0);
      expect(p.lng).toBe(16.5);
      expect(p.alt).toBe(0);
    });

    it('defaults to Neusiedl am See coordinates', () => {
      const p = new GeoPosition();
      expect(p.lat).toBe(defaultLatLngPosition[0]);
      expect(p.lng).toBe(defaultLatLngPosition[1]);
    });
  });

  describe('fromGeoJsonPosition', () => {
    it('converts [lng, lat] GeoJSON format to lat/lng', () => {
      const p = GeoPosition.fromGeoJsonPosition([16.5, 48.0]);
      expect(p.lat).toBe(48.0);
      expect(p.lng).toBe(16.5);
    });

    it('preserves altitude when present', () => {
      const p = GeoPosition.fromGeoJsonPosition([16.5, 48.0, 100]);
      expect(p.alt).toBe(100);
    });

    it('leaves alt as 0 when not provided', () => {
      const p = GeoPosition.fromGeoJsonPosition([16.5, 48.0]);
      expect(p.alt).toBe(0);
    });
  });

  describe('fromLatLng', () => {
    it('creates from [lat, lng] tuple', () => {
      const p = GeoPosition.fromLatLng([48.0, 16.5]);
      expect(p.lat).toBe(48.0);
      expect(p.lng).toBe(16.5);
    });
  });

  describe('toGeoJson', () => {
    it('returns [lng, lat] without altitude when alt is 0', () => {
      const p = new GeoPosition(48.0, 16.5, 0);
      expect(p.toGeoJson()).toEqual([16.5, 48.0]);
    });

    it('returns [lng, lat, alt] when alt is non-zero', () => {
      const p = new GeoPosition(48.0, 16.5, 100);
      expect(p.toGeoJson()).toEqual([16.5, 48.0, 100]);
    });
  });

  describe('toLatLngPosition', () => {
    it('returns [lat, lng] tuple', () => {
      const p = new GeoPosition(48.0, 16.5);
      expect(p.toLatLngPosition()).toEqual([48.0, 16.5]);
    });
  });
});

describe('GeoJsonToLatLng', () => {
  it('converts GeoJSON [lng, lat] to [lat, lng]', () => {
    expect(GeoJsonToLatLng([16.5, 48.0])).toEqual([48.0, 16.5]);
  });
});

describe('LatLngToGeoJson', () => {
  it('converts [lat, lng] to GeoJSON [lng, lat]', () => {
    expect(LatLngToGeoJson([48.0, 16.5])).toEqual([16.5, 48.0]);
  });
});

describe('latLngPosition', () => {
  it('returns provided coordinates', () => {
    expect(latLngPosition(48.0, 16.5)).toEqual([48.0, 16.5]);
  });

  it('falls back to defaults for missing values', () => {
    const [lat, lng] = latLngPosition();
    expect(lat).toBe(defaultLatLngPosition[0]);
    expect(lng).toBe(defaultLatLngPosition[1]);
  });
});
