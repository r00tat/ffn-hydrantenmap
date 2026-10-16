import { describe, expect, it } from 'vitest';
import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import {
  locationLayerName,
  locationsForLayer,
  placeAtLocation,
  releaseFromLocationLayer,
  resolveLocationLayer,
} from './locationLayers';

function loc(extra: Partial<FirecallLocation> = {}): FirecallLocation {
  return {
    id: 'l1',
    street: 'Hauptplatz',
    number: '1',
    city: 'Musterdorf',
    name: '',
    description: '',
    info: '',
    status: 'offen',
    vehicles: {},
    created: '',
    creator: '',
    ...extra,
  };
}

const vehicle: FirecallItem = {
  id: 'v1',
  name: 'TLFA 4000',
  type: 'vehicle',
  lat: 47.9,
  lng: 16.8,
};

describe('resolveLocationLayer', () => {
  it('nimmt die Ebene des Einsatzorts, wenn es sie noch gibt', () => {
    expect(resolveLocationLayer(loc({ layer: 'e1' }), new Set(['e1']))).toBe(
      'e1',
    );
  });

  it('liefert nichts, wenn die Ebene gelöscht wurde', () => {
    expect(resolveLocationLayer(loc({ layer: 'e1' }), new Set())).toBeUndefined();
  });

  it('nimmt eine gerade angelegte Ebene, bevor Einsatzort und Ebenen nachziehen', () => {
    // Zwei Zuordnungen kurz hintereinander dürfen keine zweite Ebene anlegen.
    expect(resolveLocationLayer(loc(), new Set(), 'e2')).toBe('e2');
    expect(resolveLocationLayer(loc({ layer: 'alt' }), new Set(), 'e2')).toBe(
      'e2',
    );
  });

  it('vergisst die gemerkte Ebene, sobald der Einsatzort sie trägt und sie gelöscht ist', () => {
    expect(
      resolveLocationLayer(loc({ layer: 'e2' }), new Set(), 'e2'),
    ).toBeUndefined();
  });
});

describe('placeAtLocation', () => {
  const at = loc({ lat: 47.95, lng: 16.85 });

  it('versetzt das Element und legt es in die Ebene', () => {
    expect(placeAtLocation(vehicle, at, 'e1')).toEqual({
      ...vehicle,
      lat: 47.95,
      lng: 16.85,
      layer: 'e1',
    });
  });

  it('versetzt nur, wenn keine Ebene im Spiel ist', () => {
    expect(placeAtLocation(vehicle, at)).toEqual({
      ...vehicle,
      lat: 47.95,
      lng: 16.85,
    });
  });

  it('legt nur in die Ebene, wenn der Einsatzort keine Koordinaten hat', () => {
    expect(placeAtLocation(vehicle, loc(), 'e1')).toEqual({
      ...vehicle,
      layer: 'e1',
    });
  });

  it('meldet nichts, wenn sich nichts ändert', () => {
    expect(
      placeAtLocation({ ...vehicle, lat: 47.95, lng: 16.85, layer: 'e1' }, at, 'e1'),
    ).toBeUndefined();
  });
});

describe('releaseFromLocationLayer', () => {
  it('nimmt das Element aus der Ebene des Einsatzorts', () => {
    const released = releaseFromLocationLayer(
      { ...vehicle, layer: 'e1' },
      loc({ layer: 'e1' }),
    );
    expect(released).toEqual({ ...vehicle, layer: undefined });
  });

  it('lässt eine von Hand gewählte andere Ebene stehen', () => {
    expect(
      releaseFromLocationLayer({ ...vehicle, layer: 'abschnitt' }, loc({ layer: 'e1' })),
    ).toBeUndefined();
    expect(releaseFromLocationLayer(vehicle, loc())).toBeUndefined();
  });
});

describe('locationLayerName', () => {
  it('benennt die Ebene wie den Einsatzort', () => {
    expect(locationLayerName(loc({ name: 'Keller' }))).toBe('Keller');
    expect(locationLayerName(loc())).toBe('Hauptplatz 1 Musterdorf');
  });
});

describe('locationsForLayer', () => {
  const a = loc({ id: 'a', layer: 'e1' });
  const b = loc({ id: 'b' });
  const c = loc({ id: 'c', layer: 'geloescht' });
  const active = new Set(['e1']);

  it('zeigt in einer Ebene nur deren Einsatzorte', () => {
    expect(locationsForLayer([a, b, c], 'e1', active)).toEqual([a]);
  });

  it('zeigt unter „Einsatzorte" die ohne Ebene und die mit gelöschter Ebene', () => {
    expect(locationsForLayer([a, b, c], undefined, active)).toEqual([b, c]);
  });
});
