// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// Die Elementklasse zieht über `WasserstandComponent` den Firestore-Client
// herein — dieselbe Absicherung wie in `FirecallConnection.test.ts`.
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

import { WASSERSTAND_DEFAULTS } from '../../../common/terrain/wasserstand';
import type { Wasserstand } from '../../firebase/firestore';
import { FirecallWasserstand } from './FirecallWasserstand';

describe('FirecallWasserstand', () => {
  it('überlebt data() und den Konstruktor', () => {
    const item = {
      id: 'w1',
      type: 'wasserstand',
      name: 'Wulka Nord',
      lat: 47.9483,
      lng: 16.8482,
      wasserZuschlag: 1.2,
      wasserBasisHoehe: 115.8,
      wasserBasisStufe: 'detail',
      wasserBaender: '{"baender":[]}',
      wasserStufe: 'detail',
      wasserFlaecheM2: 123456,
      wasserMaxTiefe: 1.7,
      wasserLaengsteAchse: 800,
      wasserGerechnetAm: '2026-08-25T10:00:00.000Z',
      wasserGerechnetFuer: 'v1|47.948300|16.848200|115.800|1.200|detail',
      wasserAbbruch: 'none',
      wasserKachelnFehlend: 0,
      wasserRandModell: 2,
      wasserVereinfachungM: 1,
      wasserInselnVerworfen: 4,
      color: '#1565c0',
      opacity: 45,
    } as Wasserstand;

    const back = new FirecallWasserstand(item).data();
    for (const key of Object.keys(item) as (keyof Wasserstand)[]) {
      expect(back[key]).toEqual(item[key]);
    }
  });

  it('setzt Vorbelegungen für Zuschlag, Farbe und Deckkraft', () => {
    const fresh = new FirecallWasserstand();
    expect(fresh.wasserZuschlag).toBe(WASSERSTAND_DEFAULTS.zuschlag);
    expect(fresh.color).toBe(WASSERSTAND_DEFAULTS.farbe);
    expect(fresh.opacity).toBe(WASSERSTAND_DEFAULTS.deckkraft);
    expect(fresh.type).toBe('wasserstand');
  });

  it('nennt in der Kurzinfo Wasserstand, Fläche und Veralten', () => {
    const item = new FirecallWasserstand({
      type: 'wasserstand',
      lat: 47.9483,
      lng: 16.8482,
      wasserBasisHoehe: 115.8,
      wasserZuschlag: 0.5,
      wasserFlaecheM2: 250000,
      wasserBaender: '{"baender":[]}',
      wasserStufe: 'detail',
      wasserGerechnetFuer: 'passt nicht',
    } as Wasserstand);
    expect(item.info()).toContain('116.30');
    expect(item.info()).toContain('25.0 ha');
    expect(item.info()).toContain('veraltet');
  });
});
