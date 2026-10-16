// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirecallItem, FirecallLocation } from '../components/firebase/firestore';

vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
}));
const updateDocLocal = vi.fn();
vi.mock('../lib/firestoreClient', () => ({
  updateDocLocal: (...args: unknown[]) => updateDocLocal(...args),
}));

let firecall: Record<string, unknown> = { id: 'fc1', locationLayers: true };
vi.mock('./useFirecall', () => ({
  default: () => firecall,
  useFirecallId: () => 'fc1',
}));
let layersMap: Record<string, unknown> = {};
vi.mock('./useFirecallLayers', () => ({
  useFirecallLayers: () => layersMap,
}));
let nextLayerId = 1;
const addFirecallItem = vi.fn(async () => ({ id: `e${nextLayerId++}` }));
vi.mock('./useFirecallItemAdd', () => ({ default: () => addFirecallItem }));
const updateFirecallItem = vi.fn();
vi.mock('./useFirecallItemUpdate', () => ({
  default: () => updateFirecallItem,
}));
const updateLocation = vi.fn();
vi.mock('./useFirecallLocations', () => ({
  default: () => ({ updateLocation }),
}));

const { default: useLocationLayers } = await import('./useLocationLayers');

function loc(extra: Partial<FirecallLocation> = {}): FirecallLocation {
  return {
    id: 'l1',
    street: '',
    number: '',
    city: '',
    name: 'Keller',
    description: '',
    info: '',
    status: 'offen',
    vehicles: {},
    created: '',
    creator: '',
    lat: 47.95,
    lng: 16.85,
    ...extra,
  };
}
const tlf: FirecallItem = { id: 'v1', name: 'TLF', type: 'vehicle' };
const zug: FirecallItem = { id: 'u1', name: '1. Zug', type: 'tacticalUnit' };

beforeEach(() => {
  firecall = { id: 'fc1', locationLayers: true };
  layersMap = {};
  nextLayerId = 1;
  addFirecallItem.mockClear();
  updateFirecallItem.mockReset();
  updateLocation.mockReset();
  updateDocLocal.mockReset();
});

describe('useLocationLayers', () => {
  it('legt bei der ersten Zuordnung die Ebene an und legt das Element hinein', async () => {
    const { result } = renderHook(() => useLocationLayers());
    await act(() => result.current.placeItem(tlf, loc()));

    expect(addFirecallItem).toHaveBeenCalledWith({ type: 'layer', name: 'Keller' });
    expect(updateLocation).toHaveBeenCalledWith('l1', { layer: 'e1' });
    expect(updateFirecallItem).toHaveBeenCalledWith({
      ...tlf,
      lat: 47.95,
      lng: 16.85,
      layer: 'e1',
    });
  });

  it('legt für den zweiten Zugang keine zweite Ebene an', async () => {
    const { result } = renderHook(() => useLocationLayers());
    await act(() => result.current.placeItem(tlf, loc()));
    await act(() => result.current.placeItem(zug, loc()));

    expect(addFirecallItem).toHaveBeenCalledTimes(1);
    expect(updateFirecallItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'u1', layer: 'e1' }),
    );
  });

  it('nimmt die vorhandene Ebene des Einsatzorts', async () => {
    layersMap = { e9: { id: 'e9' } };
    const { result } = renderHook(() => useLocationLayers());
    await act(() => result.current.placeItem(tlf, loc({ layer: 'e9' })));

    expect(addFirecallItem).not.toHaveBeenCalled();
    expect(updateFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'e9' }),
    );
  });

  it('versetzt ausgeschaltet nur und legt keine Ebene an', async () => {
    firecall = { id: 'fc1' };
    const { result } = renderHook(() => useLocationLayers());
    await act(() => result.current.placeItem(tlf, loc()));

    expect(addFirecallItem).not.toHaveBeenCalled();
    expect(updateFirecallItem).toHaveBeenCalledWith({
      ...tlf,
      lat: 47.95,
      lng: 16.85,
    });
  });

  it('nimmt ein abgezogenes Element aus der Ebene', async () => {
    const { result } = renderHook(() => useLocationLayers());
    await act(() =>
      result.current.releaseItem({ ...tlf, layer: 'e9' }, loc({ layer: 'e9' })),
    );
    expect(updateFirecallItem).toHaveBeenCalledWith({ ...tlf, layer: undefined });
  });

  it('zieht beim Einschalten die bestehenden Zuordnungen nach, ohne zu versetzen', async () => {
    firecall = { id: 'fc1' };
    const { result } = renderHook(() => useLocationLayers());
    await act(() =>
      result.current.setEnabled(
        true,
        [loc({ vehicles: { v1: 'TLF' } }), loc({ id: 'l2', vehicles: {} })],
        [tlf, zug],
      ),
    );

    expect(updateDocLocal).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'call/fc1' }),
      { locationLayers: true },
    );
    expect(addFirecallItem).toHaveBeenCalledTimes(1);
    expect(updateFirecallItem).toHaveBeenCalledTimes(1);
    expect(updateFirecallItem).toHaveBeenCalledWith({ ...tlf, layer: 'e1' });
  });

  it('schaltet aus, ohne Ebenen anzurühren', async () => {
    const { result } = renderHook(() => useLocationLayers());
    await act(() =>
      result.current.setEnabled(false, [loc({ vehicles: { v1: 'TLF' } })], [tlf]),
    );
    expect(updateDocLocal).toHaveBeenCalledWith(expect.anything(), {
      locationLayers: false,
    });
    expect(addFirecallItem).not.toHaveBeenCalled();
    expect(updateFirecallItem).not.toHaveBeenCalled();
  });
});
