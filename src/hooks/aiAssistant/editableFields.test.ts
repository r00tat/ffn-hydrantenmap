// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
// Der Marker zieht über seine Anhänge Firebase Storage nach.
vi.mock('../../components/firebase/firebase', () => ({ default: {}, firestore: {} }));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  getDownloadURL: vi.fn(),
  uploadBytes: vi.fn(),
  uploadBytesResumable: vi.fn(),
  deleteObject: vi.fn(),
  getBlob: vi.fn(),
  getMetadata: vi.fn(),
}));
vi.mock('../useMapEditor', () => ({ useMapEditable: vi.fn(() => false) }));

import { CircleMarker } from '../../components/FirecallItems/elements/CircleMarker';
import { FirecallItemMarker } from '../../components/FirecallItems/elements/FirecallItemMarker';
import { FirecallRohr } from '../../components/FirecallItems/elements/FirecallRohr';
import { FirecallTacticalUnit } from '../../components/FirecallItems/elements/FirecallTacticalUnit';
import { FirecallVehicle } from '../../components/FirecallItems/elements/FirecallVehicle';
import { EDITABLE_FIELDS } from './editableFields';

/**
 * `EDITABLE_FIELDS` steht neben den Handlern, weil die Elementklassen an
 * Leaflet hängen und im MCP-Server nicht laden. Damit die Liste nicht von
 * den Dialogfeldern wegdriftet, wird sie hier gegen `fields()` geprüft.
 */
const KLASSEN: Record<string, { fields(): Record<string, string> }> = {
  vehicle: new FirecallVehicle(),
  tacticalUnit: new FirecallTacticalUnit(),
  rohr: new FirecallRohr(),
  marker: new FirecallItemMarker(),
  circle: new CircleMarker(),
};

describe('EDITABLE_FIELDS', () => {
  it('kennt für jeden Typ die Elementklasse', () => {
    expect(Object.keys(EDITABLE_FIELDS).sort()).toEqual(Object.keys(KLASSEN).sort());
  });

  for (const [type, felder] of Object.entries(EDITABLE_FIELDS)) {
    it(`führt für ${type} nur Felder, die auch der Dialog hat`, () => {
      const dialogFelder = Object.keys(KLASSEN[type].fields());
      for (const feld of Object.keys(felder)) {
        expect(dialogFelder).toContain(feld);
      }
    });
  }
});
