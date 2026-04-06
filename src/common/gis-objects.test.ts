import { describe, expect, it } from 'vitest';
import type {
  GeohashCluster,
  WetterstationRecord,
  PegelstandRecord,
} from './gis-objects';

describe('GeohashCluster types', () => {
  it('should accept wetterstationen array', () => {
    const station: WetterstationRecord = {
      id: 'tawes-123',
      name: 'Neusiedl am See',
      lat: 47.948,
      lng: 16.848,
      altitude: 132,
      state: 'Burgenland',
    };
    const cluster: GeohashCluster = {
      geohash: 'u2ebzt',
      wetterstationen: [station],
    };
    expect(cluster.wetterstationen).toHaveLength(1);
    expect(cluster.wetterstationen![0].altitude).toBe(132);
  });

  it('should accept pegelstaende array', () => {
    const pegel: PegelstandRecord = {
      id: 'bgld-wulka',
      name: 'Wulka',
      lat: 47.85,
      lng: 16.52,
      type: 'river',
      source: 'bgld',
      detailUrl: '/hydrographie/die-fluesse/wulka',
    };
    const cluster: GeohashCluster = {
      geohash: 'u2ebzt',
      pegelstaende: [pegel],
    };
    expect(cluster.pegelstaende).toHaveLength(1);
    expect(cluster.pegelstaende![0].source).toBe('bgld');
  });
});
