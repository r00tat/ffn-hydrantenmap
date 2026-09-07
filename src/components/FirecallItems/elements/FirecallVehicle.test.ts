// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({ default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })) }));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('../../../components/firebase/firebase', () => ({
  firestore: {},
}));
vi.mock('../../../components/firebase/firestore', async () => {
  const actual = await vi.importActual('../../../components/firebase/firestore');
  return {
    ...actual,
    FIRECALL_ITEMS_COLLECTION_ID: 'item',
  };
});
vi.mock('../../../hooks/useMapEditor', () => ({
  useMapEditable: vi.fn(() => false),
}));

import { FirecallVehicle } from './FirecallVehicle';

describe('FirecallVehicle', () => {
  it('sets type to vehicle', () => {
    expect(new FirecallVehicle().type).toBe('vehicle');
  });

  it('reports manually entered besatzung and ats', () => {
    const vehicle = new FirecallVehicle({
      name: 'TLF',
      type: 'vehicle',
      besatzung: '8',
      ats: 4,
    } as any);
    expect(vehicle.info()).toBe('1:8 ATS: 4');
  });

  it('falls back to the assigned crew for besatzung and ats', () => {
    const vehicle = new FirecallVehicle({
      name: 'TLF',
      type: 'vehicle',
    } as any);
    vehicle.crewCount = 9;
    vehicle.atsCount = 4;
    expect(vehicle.info()).toBe('1:8 ATS: 4');
  });

  it('prefers the manual ats value over the assigned Atemschutzträger', () => {
    const vehicle = new FirecallVehicle({
      name: 'TLF',
      type: 'vehicle',
      ats: 2,
    } as any);
    vehicle.atsCount = 4;
    expect(vehicle.info()).toBe('1:0 ATS: 2');
  });

  it('reports no ats when neither a manual value nor ats crew exists', () => {
    const vehicle = new FirecallVehicle({
      name: 'Drohne',
      type: 'vehicle',
    } as any);
    expect(vehicle.info()).toBe('1:0 ATS: 0');
  });
});

describe('FirecallVehicle.isRotatable', () => {
  it('darf über den Griff gedreht werden', () => {
    expect(new FirecallVehicle().isRotatable()).toBe(true);
  });
});

describe('FirecallVehicle Kategorie', () => {
  it('schreibt am Aufbau keine Führungskraft an', () => {
    const wla = new FirecallVehicle({
      name: 'WLA Bergung',
      type: 'vehicle',
    } as any);
    expect(wla.info()).toBe('ATS: 0');
  });

  it('nennt die zugeordneten Personen am Aufbau ohne Doppelpunkt', () => {
    const wla = new FirecallVehicle({
      name: 'WLA Bergung',
      type: 'vehicle',
    } as any);
    wla.crewCount = 2;
    expect(wla.info()).toBe('2 ATS: 0');
  });

  it('folgt der gepflegten Kategorie gegen den Namen', () => {
    const wla = new FirecallVehicle({
      name: 'WLA Bergung',
      type: 'vehicle',
      kategorie: 'fahrzeug',
      besatzung: '2',
    } as any);
    expect(wla.info()).toBe('1:2 ATS: 0');
  });

  it('liest die Schreibweise „1:8" im Besatzungsfeld', () => {
    const tlf = new FirecallVehicle({
      name: 'TLFA 4000',
      type: 'vehicle',
      besatzung: '1:8',
    } as any);
    expect(tlf.info()).toBe('1:8 ATS: 0');
  });

  it('führt die Kategorie im Datensatz mit', () => {
    const wla = new FirecallVehicle({
      name: 'WLA Bergung',
      type: 'vehicle',
      kategorie: 'aufbau',
    } as any);
    expect(wla.data().kategorie).toBe('aufbau');
  });
});
