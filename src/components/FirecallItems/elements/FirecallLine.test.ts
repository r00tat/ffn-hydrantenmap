// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../common/geo';
import type { Line } from '../../firebase/firestore';

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
vi.mock('../../../components/firebase/firebase', () => ({
  firestore: {},
}));
vi.mock('../../../hooks/useMapEditor', () => ({
  useMapEditable: vi.fn(() => false),
}));

import { routingSignature } from './connection/routedPath';
import { FirecallLine } from './FirecallLine';

const start: LatLngPosition = [47.9482, 16.8482];
const end: LatLngPosition = [47.9502, 16.8512];
const points: LatLngPosition[] = [start, end];
/** Straßenverlauf mit Zuführung — was das Routing zurückgibt. */
const routed: LatLngPosition[] = [
  start,
  [47.9484, 16.8486],
  [47.949, 16.853],
  [47.9499, 16.8509],
  end,
];

const line = (overrides: Partial<Line> = {}) =>
  new FirecallLine({
    id: 'linie-1',
    type: 'line',
    name: 'Anfahrt',
    lat: start[0],
    lng: start[1],
    destLat: end[0],
    destLng: end[1],
    positions: JSON.stringify(points),
    distance: 420,
    ...overrides,
  } as Line);

describe('FirecallLine', () => {
  it('bietet Straßen-Routing und Profil als Felder an', () => {
    const item = line();
    expect(item.fields().streetRouting).toBeTruthy();
    expect(item.fieldTypes().streetRouting).toBe('boolean');
    expect(item.fieldTypes().routingProfile).toBe('select');
    // Anders als die Leitung: Eine Linie kann eine Anfahrt sein.
    expect(Object.keys(item.selectValues().routingProfile)).toEqual([
      'walk',
      'drive',
    ]);
  });

  it('trägt Option, Profil und Geometrie durch das Speichern', () => {
    // `data()` ist die Grundlage jedes Schreibvorgangs — was hier fehlt, löscht
    // ein Speichern aus dem Dialog (setDoc ohne merge).
    const data = line({
      streetRouting: 'true',
      routingProfile: 'drive',
      routedPositions: JSON.stringify(routed),
      routedFor: routingSignature(points, 'drive'),
    }).data();

    expect(data.streetRouting).toBe('true');
    expect(data.routingProfile).toBe('drive');
    expect(JSON.parse(data.routedPositions || '[]')).toEqual(routed);
    expect(data.routedFor).toBe(routingSignature(points, 'drive'));
  });

  it('zeichnet ohne die Option die direkte Verbindung', () => {
    expect(line().displayPositions()).toEqual(points);
  });

  it('zeichnet mit der Option den gespeicherten Straßenverlauf', () => {
    expect(
      line({
        streetRouting: 'true',
        routingProfile: 'drive',
        routedPositions: JSON.stringify(routed),
        routedFor: routingSignature(points, 'drive'),
      }).displayPositions()
    ).toEqual(routed);
  });

  it('zeichnet die Luftlinie, wenn die Geometrie zu einem anderen Profil gehört', () => {
    expect(
      line({
        streetRouting: 'true',
        routingProfile: 'drive',
        routedPositions: JSON.stringify(routed),
        routedFor: routingSignature(points, 'walk'),
      }).displayPositions()
    ).toEqual(points);
  });

  it('weist die Luftlinie aus, wenn das Routing ausgefallen ist', () => {
    const item = line({
      streetRouting: 'true',
      routingFailed: 'true',
      routedFor: routingSignature(points, 'walk'),
    });
    expect(item.info()).toContain('Luftlinie');
  });

  it('trägt die Dammbau-Felder durch das Speichern', () => {
    // Wie oben: Was in `data()` fehlt, löscht ein Speichern aus dem Dialog.
    const data = line({
      dammbau: 'true',
      dammHoehe: 1.2,
      freibord: 0.4,
      dammBauweise: 'notdamm',
      dammBoeschung: 2.5,
      sackFormat: '40x70',
      sackFuellgrad: 60,
      sandDichte: 1.6,
      dammReserve: 15,
      dammPersonal: 20,
      dammZielzeit: 3,
      fuellTrichter: 'true',
      saeckeRoedeln: 'true',
      transportWeite: 25,
      lkwNutzlast: 12,
      fuellLeistung: 45,
      transportLeistung: 55,
      verbauLeistung: 65,
    }).data();

    expect(data).toMatchObject({
      dammbau: 'true',
      dammHoehe: 1.2,
      freibord: 0.4,
      dammBauweise: 'notdamm',
      dammBoeschung: 2.5,
      sackFormat: '40x70',
      sackFuellgrad: 60,
      sandDichte: 1.6,
      dammReserve: 15,
      dammPersonal: 20,
      dammZielzeit: 3,
      fuellTrichter: 'true',
      saeckeRoedeln: 'true',
      transportWeite: 25,
      lkwNutzlast: 12,
      fuellLeistung: 45,
      transportLeistung: 55,
      verbauLeistung: 65,
    });
  });

  it('heißt Dammlinie und nennt den Sandsackbedarf, sobald der Rechner läuft', () => {
    const item = line({ dammbau: 'true', dammHoehe: 1 });
    expect(item.markerName()).toBe('Dammlinie');
    expect(item.info()).toContain('Sandsäcke');
  });

  it('bleibt eine Linie ohne den Rechner', () => {
    const item = line();
    expect(item.markerName()).toBe('Linie');
    expect(item.info()).not.toContain('Sandsäcke');
  });

  it('weist nichts aus, solange das Routing trägt', () => {
    const item = line({
      streetRouting: 'true',
      routedPositions: JSON.stringify(routed),
      routedFor: routingSignature(points, 'walk'),
    });
    expect(item.info()).toContain('420m');
    expect(item.info()).not.toContain('Luftlinie');
  });
});
