import { describe, expect, it } from 'vitest';
import { FirecallLocation } from '../firebase/firestore';
import {
  isAssignedToLocation,
  locationLabel,
  locationUpdatesForItem,
} from './location-assignment';

function loc(
  id: string,
  vehicles: Record<string, string>,
  extra: Partial<FirecallLocation> = {},
): FirecallLocation {
  return {
    id,
    street: '',
    number: '',
    city: 'Neusiedl am See',
    name: '',
    description: '',
    info: '',
    status: 'offen',
    vehicles,
    created: '',
    creator: '',
    ...extra,
  };
}

const item = { id: 'v1', name: 'TLFA 4000' };

describe('locationLabel', () => {
  it('nimmt den Namen, sonst die Adresse', () => {
    expect(locationLabel(loc('a', {}, { name: 'Keller' }))).toBe('Keller');
    expect(
      locationLabel(loc('a', {}, { street: 'Hauptplatz', number: '1' })),
    ).toBe('Hauptplatz 1');
    expect(locationLabel(loc('a', {}))).toBe('Einsatzort');
  });
});

describe('isAssignedToLocation', () => {
  it('erkennt die Zuordnung über die Element-ID', () => {
    expect(isAssignedToLocation(loc('a', { v1: 'TLFA 4000' }), item)).toBe(true);
    expect(isAssignedToLocation(loc('a', { v2: 'KDTFA' }), item)).toBe(false);
  });

  it('erkennt alte Einträge, die nur den Namen tragen', () => {
    expect(
      isAssignedToLocation(loc('a', { 'TLFA 4000': 'TLFA 4000' }), item),
    ).toBe(true);
  });
});

describe('locationUpdatesForItem', () => {
  it('ergänzt neu gewählte und entfernt abgewählte Einsatzorte', () => {
    const locations = [
      loc('a', { v1: 'TLFA 4000', v2: 'KDTFA' }),
      loc('b', {}),
      loc('c', { 'TLFA 4000': 'TLFA 4000' }),
    ];
    expect(locationUpdatesForItem(locations, item, ['b'])).toEqual([
      { id: 'a', vehicles: { v2: 'KDTFA' } },
      { id: 'b', vehicles: { v1: 'TLFA 4000' } },
      { id: 'c', vehicles: {} },
    ]);
  });

  it('lässt unveränderte Einsatzorte in Ruhe', () => {
    const locations = [loc('a', { v1: 'TLFA 4000' }), loc('b', {})];
    expect(locationUpdatesForItem(locations, item, ['a'])).toEqual([]);
  });
});
