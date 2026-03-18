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

import { FirecallTacticalUnit } from './FirecallTacticalUnit';

describe('FirecallTacticalUnit', () => {
  it('sets type to tacticalUnit', () => {
    const unit = new FirecallTacticalUnit();
    expect(unit.type).toBe('tacticalUnit');
  });

  it('initializes from TacticalUnit data', () => {
    const unit = new FirecallTacticalUnit({
      name: '1. Gruppe',
      type: 'tacticalUnit',
      unitType: 'gruppe',
      fw: 'FF Neusiedl',
      mann: 8,
      fuehrung: 'OBI Mustermann',
      ats: 4,
      alarmierung: '2024-01-01T14:30:00',
      eintreffen: '2024-01-01T14:45:00',
      abruecken: '',
    });
    expect(unit.unitType).toBe('gruppe');
    expect(unit.fw).toBe('FF Neusiedl');
    expect(unit.mann).toBe(8);
    expect(unit.fuehrung).toBe('OBI Mustermann');
    expect(unit.ats).toBe(4);
  });

  it('returns correct markerName', () => {
    const unit = new FirecallTacticalUnit({
      name: 'Test', type: 'tacticalUnit', unitType: 'zug',
    });
    expect(unit.markerName()).toBe('Taktische Einheit');
  });

  it('title includes name and fw', () => {
    const unit = new FirecallTacticalUnit({
      name: '1. Zug', type: 'tacticalUnit', fw: 'FF NaS',
    });
    expect(unit.title()).toBe('1. Zug FF NaS');
  });

  it('info shows mann and ats', () => {
    const unit = new FirecallTacticalUnit({
      name: 'Test', type: 'tacticalUnit', mann: 8, ats: 4,
    });
    expect(unit.info()).toBe('Stärke: 8 ATS: 4');
  });

  it('data() round-trips all fields', () => {
    const input = {
      name: '1. Gruppe',
      type: 'tacticalUnit' as const,
      unitType: 'gruppe' as const,
      fw: 'FF NaS',
      mann: 8,
      fuehrung: 'OBI Test',
      ats: 4,
      alarmierung: '2024-01-01T14:30:00',
      eintreffen: '2024-01-01T14:45:00',
      abruecken: '',
    };
    const unit = new FirecallTacticalUnit(input);
    const data = unit.data();
    expect(data.unitType).toBe('gruppe');
    expect(data.fw).toBe('FF NaS');
    expect(data.mann).toBe(8);
    expect(data.fuehrung).toBe('OBI Test');
    expect(data.ats).toBe(4);
    expect(data.type).toBe('tacticalUnit');
  });

  it('icon returns correct icon for unitType', () => {
    const unit = new FirecallTacticalUnit({
      name: 'Test', type: 'tacticalUnit', unitType: 'gruppe',
    });
    const icon = unit.icon();
    expect(icon.options.iconUrl).toContain('Gruppe.png');
  });

  it('selectValues includes unitType options', () => {
    const unit = new FirecallTacticalUnit();
    const sv = unit.selectValues();
    expect(sv.unitType).toBeDefined();
    expect(sv.unitType.gruppe).toBe('Gruppe');
  });
});
