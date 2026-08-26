import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchAddress = vi.fn();
const searchPlace = vi.fn();

vi.mock('../actions/maps/places', () => ({
  searchAddress: (...args: unknown[]) => searchAddress(...args),
  searchPlace: (...args: unknown[]) => searchPlace(...args),
}));

import {
  DEFAULT_LOCATION_CITY,
  geocodableAddress,
  geocodeAddress,
  geocodeTargetForChange,
} from './geocode';

function hit(lat: string, lon: string) {
  return [{ lat, lon }];
}

describe('geocodeAddress', () => {
  beforeEach(() => {
    searchAddress.mockResolvedValue([]);
    searchPlace.mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('sucht strukturiert mit Hausnummer, Straße und Ort', async () => {
    searchAddress.mockResolvedValue(hit('47.8451', '16.5233'));

    const coords = await geocodeAddress('Hauptplatz', '12', 'Eisenstadt');

    expect(coords).toEqual({ lat: 47.8451, lng: 16.5233 });
    expect(searchAddress).toHaveBeenCalledWith(
      { street: '12 Hauptplatz', city: 'Eisenstadt' },
      expect.objectContaining({ maxResults: 1 }),
    );
  });

  it('sortiert nicht nach Neusiedl, wenn ein Ort angegeben ist', async () => {
    searchAddress.mockResolvedValue(hit('47.8451', '16.5233'));

    await geocodeAddress('Hauptplatz', '12', 'Eisenstadt');

    // `null`, nicht `undefined` — `searchPlace`/`searchAddress` setzen bei
    // `undefined` Neusiedl als Sortierkriterium ein.
    expect(searchAddress.mock.calls[0][1].position).toBeNull();
  });

  it('zieht ohne Ort die Nähe zu Neusiedl als Tiebreaker heran', async () => {
    searchAddress.mockResolvedValue(hit('47.9482', '16.8482'));

    await geocodeAddress('Hauptplatz', '12', '');

    expect(searchAddress.mock.calls[0][0]).toEqual({ street: '12 Hauptplatz' });
    expect(searchAddress.mock.calls[0][1].position).toBeDefined();
  });

  it('geocodiert eine Straße ohne Hausnummer', async () => {
    searchAddress.mockResolvedValue(hit('47.8451', '16.5233'));

    const coords = await geocodeAddress('Hauptplatz', '', 'Eisenstadt');

    expect(coords).toEqual({ lat: 47.8451, lng: 16.5233 });
    expect(searchAddress.mock.calls[0][0]).toEqual({
      street: 'Hauptplatz',
      city: 'Eisenstadt',
    });
  });

  it('geocodiert einen Ort ohne Straße', async () => {
    searchAddress.mockResolvedValue(hit('47.8451', '16.5233'));

    const coords = await geocodeAddress('', '', 'Eisenstadt');

    expect(coords).toEqual({ lat: 47.8451, lng: 16.5233 });
    expect(searchAddress.mock.calls[0][0]).toEqual({ city: 'Eisenstadt' });
  });

  it('gibt ohne jede Adressangabe null zurück, ohne zu suchen', async () => {
    expect(await geocodeAddress('', '', '')).toBeNull();
    expect(searchAddress).not.toHaveBeenCalled();
    expect(searchPlace).not.toHaveBeenCalled();
  });

  it('fällt bei leerem strukturiertem Ergebnis auf die Freitextsuche zurück', async () => {
    searchAddress.mockResolvedValue([]);
    searchPlace.mockResolvedValue(hit('47.8451', '16.5233'));

    const coords = await geocodeAddress('Hauptplatz', '12a', 'Eisenstadt');

    expect(coords).toEqual({ lat: 47.8451, lng: 16.5233 });
    expect(searchPlace).toHaveBeenCalledWith(
      'Hauptplatz 12a, Eisenstadt',
      expect.objectContaining({ maxResults: 1, position: null }),
    );
  });

  it('beschränkt den Freitext-Fallback ohne Ort nicht auf einen Ort', async () => {
    searchPlace.mockResolvedValue(hit('47.9482', '16.8482'));

    await geocodeAddress('Hauptplatz', '12', '');

    expect(searchPlace.mock.calls[0][0]).toBe('Hauptplatz 12');
  });

  it('fällt auch nach einem Fehler der strukturierten Suche auf Freitext zurück', async () => {
    searchAddress.mockRejectedValue(new Error('Geocoding failed 500'));
    searchPlace.mockResolvedValue(hit('47.8451', '16.5233'));

    const coords = await geocodeAddress('Hauptplatz', '12', 'Eisenstadt');

    expect(coords).toEqual({ lat: 47.8451, lng: 16.5233 });
  });

  it('gibt null zurück, wenn beide Suchen nichts finden', async () => {
    expect(await geocodeAddress('Nirgendweg', '1', 'Nirgendwo')).toBeNull();
  });

  it('gibt null zurück, wenn beide Suchen scheitern', async () => {
    searchAddress.mockRejectedValue(new Error('boom'));
    searchPlace.mockRejectedValue(new Error('boom'));

    expect(await geocodeAddress('Hauptplatz', '12', 'Eisenstadt')).toBeNull();
  });
});

describe('geocodableAddress', () => {
  it('nimmt Straße samt Hausnummer', () => {
    expect(
      geocodableAddress({
        street: 'Hauptplatz',
        number: '12',
        city: 'Eisenstadt',
      }),
    ).toEqual({
      street: 'Hauptplatz',
      number: '12',
      city: 'Eisenstadt',
    });
  });

  it('setzt ohne Ort Neusiedl am See ein', () => {
    expect(
      geocodableAddress({ street: 'Hauptplatz', number: '12' })?.city,
    ).toBe(DEFAULT_LOCATION_CITY);
  });

  it('nimmt einen Ort ohne Straße', () => {
    expect(geocodableAddress({ city: 'Eisenstadt' })).toEqual({
      street: '',
      number: '',
      city: 'Eisenstadt',
    });
  });

  it('nimmt eine Straße ohne Hausnummer', () => {
    expect(
      geocodableAddress({ street: 'Hauptplatz', city: 'Eisenstadt' })
    ).toEqual({ street: 'Hauptplatz', number: '', city: 'Eisenstadt' });
  });

  it('nimmt eine Straße ohne Hausnummer und ohne Ort', () => {
    expect(geocodableAddress({ street: 'Hauptplatz' })).toEqual({
      street: 'Hauptplatz',
      number: '',
      city: DEFAULT_LOCATION_CITY,
    });
  });

  it('lehnt eine Hausnummer ohne Straße ab', () => {
    expect(geocodableAddress({ number: '12', city: 'Eisenstadt' })).toBeNull();
  });

  it('lehnt eine leere Adresse ab, statt auf den Vorgabe-Ort zu geocodieren', () => {
    expect(geocodableAddress({})).toBeNull();
    expect(
      geocodableAddress({ street: '  ', number: ' ', city: ' ' }),
    ).toBeNull();
  });
});

describe('geocodeTargetForChange', () => {
  const address = {
    street: 'Hauptplatz',
    number: '12',
    city: 'Neusiedl am See',
  };

  it('löst aus, wenn sich nur der Ort ändert', () => {
    expect(
      geocodeTargetForChange(address, { ...address, city: 'Eisenstadt' }),
    ).toEqual({
      street: 'Hauptplatz',
      number: '12',
      city: 'Eisenstadt',
    });
  });

  it('löst aus, wenn der Ort geleert wird, und fällt auf die Vorgabe zurück', () => {
    const target = geocodeTargetForChange(
      { ...address, city: 'Eisenstadt' },
      { ...address, city: '' },
    );
    expect(target).toEqual({
      street: 'Hauptplatz',
      number: '12',
      city: DEFAULT_LOCATION_CITY,
    });
  });

  it('löst bei Straßen- und Hausnummernänderung aus', () => {
    expect(
      geocodeTargetForChange(address, { ...address, number: '13' }),
    ).not.toBeNull();
    expect(
      geocodeTargetForChange(address, {
        ...address,
        street: 'Untere Hauptstraße',
      }),
    ).not.toBeNull();
  });

  it('löst ohne Änderung nicht aus', () => {
    expect(geocodeTargetForChange(address, { ...address })).toBeNull();
  });

  it('ignoriert reine Leerraumänderungen', () => {
    expect(
      geocodeTargetForChange(address, {
        ...address,
        city: ' Neusiedl am See ',
      }),
    ).toBeNull();
  });

  it('löst nicht aus, solange die Adresse unbrauchbar ist', () => {
    expect(geocodeTargetForChange({}, { number: '12' })).toBeNull();
    expect(geocodeTargetForChange({}, {})).toBeNull();
  });

  it('löst erneut aus, wenn zur Straße die Hausnummer nachkommt', () => {
    const withoutNumber = {
      street: 'Hauptplatz',
      number: '',
      city: 'Eisenstadt',
    };
    expect(geocodeTargetForChange({}, withoutNumber)).toEqual(withoutNumber);
    expect(
      geocodeTargetForChange(withoutNumber, { ...withoutNumber, number: '12' })
    ).toEqual({ street: 'Hauptplatz', number: '12', city: 'Eisenstadt' });
  });
});
