import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchAddress, searchPlace } from './places';
import { GeoPosition } from '../../../common/geo';

/** Minimaler Nominatim-Treffer, nur mit den Feldern, die der Code liest. */
function place(lat: string, lon: string, name = 'Treffer') {
  return {
    place_id: 1,
    licence: 'ODbL',
    osm_type: 'node',
    osm_id: 1,
    lat,
    lon,
    place_rank: 30,
    importance: 0.5,
    name,
    display_name: name,
    boundingbox: [0, 0, 0, 0],
  };
}

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastUrl(fetchMock: ReturnType<typeof vi.fn>) {
  return new URL(fetchMock.mock.calls.at(-1)![0] as string);
}

describe('searchAddress', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('stellt eine strukturierte Anfrage ohne Freitext-Parameter', async () => {
    const fetchMock = mockFetchOnce([place('47.9', '16.8')]);

    await searchAddress({ street: '12 Hauptplatz', city: 'Eisenstadt' });

    const url = lastUrl(fetchMock);
    expect(url.origin + url.pathname).toBe(
      'https://nominatim.openstreetmap.org/search',
    );
    expect(url.searchParams.get('street')).toBe('12 Hauptplatz');
    expect(url.searchParams.get('city')).toBe('Eisenstadt');
    expect(url.searchParams.get('country')).toBe('Österreich');
    // Nominatim erlaubt `q` nicht gemeinsam mit strukturierten Feldern.
    expect(url.searchParams.get('q')).toBeNull();
  });

  it('lässt leere Adressteile aus der Anfrage weg', async () => {
    const fetchMock = mockFetchOnce([]);

    await searchAddress({ street: 'Hauptplatz', city: '' });

    expect(lastUrl(fetchMock).searchParams.has('city')).toBe(false);
  });

  it('behält ohne Position die Reihenfolge von Nominatim', async () => {
    mockFetchOnce([
      place('47.0', '16.0', 'weit weg'),
      place('47.9482', '16.8482', 'nah'),
    ]);

    const results = await searchAddress({
      street: 'Hauptplatz',
      city: 'Eisenstadt',
    });

    expect(results.map((r) => r.name)).toEqual(['weit weg', 'nah']);
  });

  it('sortiert mit Position nach Entfernung', async () => {
    mockFetchOnce([
      place('47.0', '16.0', 'weit weg'),
      place('47.9482', '16.8482', 'nah'),
    ]);

    const results = await searchAddress(
      { street: 'Hauptplatz' },
      { position: GeoPosition.fromLatLng([47.9482913, 16.848222]) },
    );

    expect(results.map((r) => r.name)).toEqual(['nah', 'weit weg']);
  });

  it('kürzt auf maxResults', async () => {
    mockFetchOnce([
      place('47.1', '16.1'),
      place('47.2', '16.2'),
      place('47.3', '16.3'),
    ]);

    const results = await searchAddress(
      { street: 'Hauptplatz' },
      { maxResults: 2 },
    );

    expect(results).toHaveLength(2);
  });

  it('wirft bei einem Fehlerstatus', async () => {
    mockFetchOnce({ error: 'nope' }, 500);

    await expect(searchAddress({ street: 'Hauptplatz' })).rejects.toThrow(
      /Geocoding failed 500/,
    );
  });
});

describe('searchPlace', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sortiert mit `position: null` nicht', async () => {
    mockFetchOnce([
      place('47.0', '16.0', 'weit weg'),
      place('47.9482', '16.8482', 'nah'),
    ]);

    const results = await searchPlace('Hauptplatz 1', { position: null });

    expect(results.map((r) => r.name)).toEqual(['weit weg', 'nah']);
  });

  it('fragt weiterhin per Freitext und sortiert nach Nähe zu Neusiedl', async () => {
    const fetchMock = mockFetchOnce([
      place('47.0', '16.0', 'weit weg'),
      place('47.9482', '16.8482', 'nah'),
    ]);

    const results = await searchPlace('Hauptplatz 1');

    expect(lastUrl(fetchMock).searchParams.get('q')).toBe(
      'Hauptplatz 1, Österreich',
    );
    expect(results.map((r) => r.name)).toEqual(['nah', 'weit weg']);
  });
});
