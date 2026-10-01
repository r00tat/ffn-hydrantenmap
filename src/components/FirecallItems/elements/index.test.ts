// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('../../firebase/firebase', () => ({
  default: {},
  firebaseApp: {},
  firestore: {},
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(async () => ''),
  getBlob: vi.fn(async () => new Blob()),
  listAll: vi.fn(async () => ({ items: [], prefixes: [] })),
  uploadBytesResumable: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

import { FirecallItemLayer } from './FirecallItemLayer';
import { FirecallVehicle } from './FirecallVehicle';
import {
  changeItemType,
  fcItemClasses,
  getItemClass,
  getItemInstance,
} from './index';

describe('fcItemClasses', () => {
  // The type picker and the sidebar render `factory().icon()`; a class that
  // inherits the base factory would show the generic marker icon instead.
  it.each(Object.entries(fcItemClasses))(
    'factory of %s returns an instance of its own class',
    (_type, cls) => {
      expect(cls.factory()).toBeInstanceOf(cls);
    }
  );

  it('uses the layer icon for layers', () => {
    expect(getItemClass('layer').factory()).toBeInstanceOf(FirecallItemLayer);
    expect(getItemClass('layer').factory().icon().options.iconUrl).toBe(
      '/icons/layer.svg'
    );
  });
});

/**
 * Typwechsel im Dialog (#836): Der Dialog öffnet als Markierung, und die
 * Markierung bringt ihre Vorgabefarbe `#0000ff` mit. Wer dann auf „Fahrzeug"
 * wechselt, darf diese Vorgabe nicht als gewählte Farbe mitnehmen — sonst ist
 * das neue Fahrzeug blau und der Schalter „Fremdorganisation" wirkungslos.
 */
describe('changeItemType', () => {
  function newMarker(fields: Record<string, unknown> = {}) {
    return getItemInstance({
      type: 'marker',
      datum: '2026-10-01T10:00:00.000Z',
      ...fields,
    } as any);
  }

  const colorOf = (item: { data(): unknown }) =>
    (item.data() as { color?: string }).color;

  it('nimmt die Vorgabefarbe der Markierung nicht ins Fahrzeug mit', () => {
    const vehicle = changeItemType(newMarker(), 'vehicle');
    expect(vehicle).toBeInstanceOf(FirecallVehicle);
    expect(colorOf(vehicle)).toBeUndefined();
    expect(vehicle.filteredData()).not.toHaveProperty('color');
  });

  it('zeichnet das so angelegte Fahrzeug rot, mit Fremdorganisation blau', () => {
    const vehicle = changeItemType(newMarker(), 'vehicle') as FirecallVehicle;
    expect(vehicle.icon().options.iconUrl).toContain(encodeURIComponent('fill:#ff0000'));
    const fremd = vehicle.copy().set('fremd', 'true') as FirecallVehicle;
    expect(fremd.icon().options.iconUrl).toContain(encodeURIComponent('fill:#1976d2'));
  });

  it('behält eine bewusst gewählte Farbe', () => {
    const vehicle = changeItemType(newMarker({ color: '#2e7d32' }), 'vehicle');
    expect(colorOf(vehicle)).toBe('#2e7d32');
  });

  it('behält, was eingegeben wurde', () => {
    const vehicle = changeItemType(
      newMarker({ name: 'TLF', beschreibung: 'vorne', layer: 'l1' }),
      'vehicle'
    );
    expect(vehicle.data()).toMatchObject({
      type: 'vehicle',
      name: 'TLF',
      beschreibung: 'vorne',
      layer: 'l1',
      datum: '2026-10-01T10:00:00.000Z',
    });
  });

  it('nimmt auch die Vorgabefarbe einer Fläche nicht mit', () => {
    const area = getItemInstance({ type: 'area' } as any);
    expect(colorOf(area)).toBe('blue');
    expect(colorOf(changeItemType(area, 'vehicle'))).toBeUndefined();
  });

  it('gibt dem Zieltyp seine eigene Vorgabe', () => {
    const area = changeItemType(newMarker(), 'area');
    expect(colorOf(area)).toBe('blue');
  });
});
