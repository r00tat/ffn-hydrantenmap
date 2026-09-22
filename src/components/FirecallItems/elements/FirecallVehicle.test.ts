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

/**
 * Fahrzeuge fremder Organisationen (#Bug-Report „Fahrzeuge Fremdorganisation").
 *
 * Auf einer Karte mit Rettung, Polizei und Nachbarwehren sind zwanzig rote
 * Balken keine Lage, sondern ein Haufen. Die Farbe ist deshalb frei; der
 * Schalter „Fremdfahrzeug" setzt nur eine andere Vorgabe und kennzeichnet.
 */
function decodeIcon(vehicle: FirecallVehicle): string {
  const url = vehicle.icon().options.iconUrl as string;
  return decodeURIComponent(url.slice('data:image/svg+xml;utf8,'.length));
}

describe('FirecallVehicle: Fremdfahrzeug und Farbe', () => {
  it('zeichnet ein eigenes Fahrzeug rot', () => {
    const vehicle = new FirecallVehicle({ name: 'TLF', type: 'vehicle' } as any);
    expect(decodeIcon(vehicle)).toContain('fill:#ff0000');
  });

  it('zeichnet ein Fremdfahrzeug ohne eigene Farbe blau', () => {
    const vehicle = new FirecallVehicle({
      name: 'RTW',
      fw: 'Rotes Kreuz',
      type: 'vehicle',
      fremd: 'true',
    } as any);
    expect(decodeIcon(vehicle)).toContain('fill:#1976d2');
  });

  it('nimmt die gewählte Farbe vor jeder Vorgabe', () => {
    const vehicle = new FirecallVehicle({
      name: 'Streife',
      fw: 'Polizei',
      type: 'vehicle',
      fremd: 'true',
      color: '#2e7d32',
    } as any);
    expect(decodeIcon(vehicle)).toContain('fill:#2e7d32');
  });

  it('führt Schalter und Farbe als Felder', () => {
    const vehicle = new FirecallVehicle();
    expect(Object.keys(vehicle.fields())).toContain('fremd');
    expect(vehicle.fieldTypes().fremd).toBe('boolean');
    expect(vehicle.fieldTypes().color).toBe('color');
  });

  it('speichert beides', () => {
    const vehicle = new FirecallVehicle({
      name: 'RTW',
      type: 'vehicle',
      fremd: 'true',
      color: '#1976d2',
    } as any);
    expect(vehicle.data()).toMatchObject({ fremd: 'true', color: '#1976d2' });
    // Und übersteht eine Kopie — der Dialog arbeitet auf Kopien.
    expect(vehicle.copy().data()).toMatchObject({ fremd: 'true' });
  });

  it('weist das Fahrzeug im Popup als fremd aus', () => {
    const vehicle = new FirecallVehicle({
      name: 'RTW',
      fw: 'Rotes Kreuz',
      type: 'vehicle',
      fremd: 'true',
    } as any);
    expect(vehicle.isFremd()).toBe(true);
    expect(new FirecallVehicle({ name: 'TLF', type: 'vehicle' } as any).isFremd()).toBe(
      false
    );
  });
});
