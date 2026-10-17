import { describe, expect, it } from 'vitest';
import { FirecallLocation } from '../firebase/firestore';
import {
  currentLocationId,
  isAssignedToLocation,
  locationLabel,
  moveItemToLocation,
  moveItemsToLocation,
  positionAtLocation,
  unitWithVehicles,
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
      locationLabel(loc('a', {}, { street: 'Hauptplatz', number: '1', city: '' })),
    ).toBe('Hauptplatz 1');
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

describe('currentLocationId', () => {
  it('liefert den Einsatzort des Elements oder leer', () => {
    const locations = [loc('a', {}), loc('b', { v1: 'TLFA 4000' })];
    expect(currentLocationId(locations, item)).toBe('b');
    expect(currentLocationId([loc('a', {})], item)).toBe('');
  });
});

describe('moveItemToLocation', () => {
  it('zieht vom bisherigen Einsatzort ab und ordnet dem neuen zu', () => {
    const a = loc('a', { v1: 'TLFA 4000', v2: 'KDTFA' });
    const b = loc('b', {});
    const c = loc('c', { 'TLFA 4000': 'TLFA 4000' });
    expect(moveItemToLocation([a, b, c], item, 'b')).toEqual({
      updates: [
        { id: 'a', vehicles: { v2: 'KDTFA' } },
        { id: 'c', vehicles: {} },
        { id: 'b', vehicles: { v1: 'TLFA 4000' } },
      ],
      removedFrom: [a, c],
      assignedTo: b,
    });
  });

  it('zieht ohne Ziel nur ab', () => {
    const a = loc('a', { v1: 'TLFA 4000' });
    expect(moveItemToLocation([a], item, '')).toEqual({
      updates: [{ id: 'a', vehicles: {} }],
      removedFrom: [a],
      assignedTo: undefined,
    });
  });

  it('ändert nichts, wenn das Element schon dort steht', () => {
    const a = loc('a', { v1: 'TLFA 4000' });
    expect(moveItemToLocation([a, loc('b', {})], item, 'a')).toEqual({
      updates: [],
      removedFrom: [],
      assignedTo: undefined,
    });
  });
});

describe('positionAtLocation', () => {
  const vehicle = { id: 'v1', name: 'TLFA 4000', type: 'vehicle', lat: 47.9, lng: 16.8 };

  it('setzt das Element auf die Koordinaten des Einsatzorts', () => {
    expect(
      positionAtLocation(vehicle, loc('a', {}, { lat: 47.95, lng: 16.85 })),
    ).toEqual({ ...vehicle, lat: 47.95, lng: 16.85 });
  });

  it('lässt das Element stehen, wenn der Einsatzort keine Koordinaten hat', () => {
    expect(positionAtLocation(vehicle, loc('a', {}))).toBeUndefined();
  });

  it('meldet nichts, wenn das Element schon dort steht', () => {
    expect(
      positionAtLocation(vehicle, loc('a', {}, { lat: 47.9, lng: 16.8 })),
    ).toBeUndefined();
  });
});

describe('unitWithVehicles', () => {
  it('liefert die Einheit samt ihrer Fahrzeuge', () => {
    const items = [
      { id: 'u1', name: 'Zug Nord', type: 'tacticalUnit' },
      { id: 'v1', name: 'TLF', type: 'vehicle', tacticalUnitId: 'u1' },
      { id: 'v2', name: 'RLF', type: 'vehicle' },
    ];
    expect(unitWithVehicles(items[0], items).map((i) => i.id)).toEqual([
      'u1',
      'v1',
    ]);
  });

  it('liefert ein Fahrzeug allein', () => {
    const tlf = { id: 'v1', name: 'TLF', type: 'vehicle' };
    expect(unitWithVehicles(tlf, [tlf])).toEqual([tlf]);
  });
});

describe('moveItemsToLocation', () => {
  const zug = { id: 'u1', name: 'Zug Nord' };
  const tlf = { id: 'v1', name: 'TLF' };
  const klf = { id: 'v2', name: 'KLF' };

  it('versetzt mehrere Elemente mit einer Änderung je Einsatzort', () => {
    const locations = [
      loc('a', { u1: 'Zug Nord', v1: 'TLF' }),
      loc('b', { v2: 'KLF', x: 'RLF' }),
      loc('c', {}),
    ];
    const move = moveItemsToLocation(locations, [zug, tlf, klf], 'c');
    const byId = Object.fromEntries(move.updates.map((u) => [u.id, u.vehicles]));
    expect(byId).toEqual({
      a: {},
      b: { x: 'RLF' },
      c: { u1: 'Zug Nord', v1: 'TLF', v2: 'KLF' },
    });
    expect(move.assignedTo?.id).toBe('c');
    expect(move.removedFrom.map((l) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('zieht mit leerem Ziel alle ab', () => {
    const locations = [loc('a', { u1: 'Zug Nord', v1: 'TLF' })];
    const move = moveItemsToLocation(locations, [zug, tlf], '');
    expect(move.updates).toEqual([{ id: 'a', vehicles: {} }]);
    expect(move.assignedTo).toBeUndefined();
  });
});
