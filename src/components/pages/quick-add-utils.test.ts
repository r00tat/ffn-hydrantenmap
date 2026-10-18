import { describe, expect, it } from 'vitest';
import { FirecallItem, Fzg, TacticalUnit } from '../firebase/firestore';
import {
  buildQuickAddItem,
  collectFwOptions,
  parseTotalStrength,
  QuickAddInput,
} from './quick-add-utils';

const NOW = new Date('2026-10-13T10:15:00.000Z');
const CTX = { now: NOW, lat: 47.9, lng: 16.8 };

function input(overrides: Partial<QuickAddInput> = {}): QuickAddInput {
  return {
    kind: 'vehicle',
    name: 'TLFA 4000',
    fw: 'Weiden am See',
    strength: '',
    ats: '',
    unitType: 'zug',
    fremd: false,
    arrived: false,
    ...overrides,
  };
}

describe('parseTotalStrength', () => {
  it.each([
    ['9', 9],
    ['1:8', 9],
    ['1/8', 9],
    ['1/8/9', 9],
    ['1/1/7//9', 9],
    [' 12 ', 12],
    ['', undefined],
    ['abc', undefined],
    ['0', undefined],
  ])('liest „%s" als %s', (raw, expected) => {
    expect(parseTotalStrength(raw)).toBe(expected);
  });
});

describe('collectFwOptions', () => {
  it('liefert die eigene Feuerwehr zuerst und jede weitere einmal', () => {
    const items = [
      { type: 'vehicle', name: 'A', fw: 'Weiden am See' },
      { type: 'vehicle', name: 'B', fw: 'Neusiedl am See' },
      { type: 'tacticalUnit', name: 'C', fw: 'Weiden am See' },
      { type: 'vehicle', name: 'D', fw: 'Rotes Kreuz' },
      { type: 'vehicle', name: 'E' },
    ] as FirecallItem[];
    expect(collectFwOptions(items, 'Neusiedl am See')).toEqual([
      'Neusiedl am See',
      'Rotes Kreuz',
      'Weiden am See',
    ]);
  });
});

describe('buildQuickAddItem', () => {
  it('liefert ohne Bezeichnung nichts', () => {
    expect(buildQuickAddItem(input({ name: '   ' }), CTX)).toBeUndefined();
  });

  it('legt ein Fahrzeug mit Besatzung ohne Kommandant an', () => {
    const item = buildQuickAddItem(
      input({ strength: '1:8', ats: '4', fremd: true }),
      CTX,
    ) as Fzg;
    expect(item).toEqual({
      type: 'vehicle',
      name: 'TLFA 4000',
      fw: 'Weiden am See',
      besatzung: '8',
      ats: 4,
      fremd: 'true',
      alarmierung: NOW.toISOString(),
      datum: NOW.toISOString(),
      lat: 47.9,
      lng: 16.8,
    });
  });

  it('lässt leere Angaben am Fahrzeug weg', () => {
    const item = buildQuickAddItem(
      input({ fw: ' ', strength: '', ats: 'x' }),
      CTX,
    ) as Fzg;
    expect(item.fw).toBeUndefined();
    expect(item.besatzung).toBeUndefined();
    expect(item.ats).toBeUndefined();
    expect(item.fremd).toBeUndefined();
  });

  it('setzt das Eintreffen auf jetzt, wenn die Kräfte da sind', () => {
    const item = buildQuickAddItem(input({ arrived: true }), CTX) as Fzg;
    expect(item.eintreffen).toBe(NOW.toISOString());
    expect(item.alarmierung).toBeUndefined();
  });

  it('setzt sonst die Alarmierung auf jetzt — damit steht es im Tagebuch', () => {
    const item = buildQuickAddItem(input({ arrived: false }), CTX) as Fzg;
    expect(item.alarmierung).toBe(NOW.toISOString());
    expect(item.eintreffen).toBeUndefined();
  });

  it('legt eine taktische Einheit mit Gesamtstärke an', () => {
    const item = buildQuickAddItem(
      input({
        kind: 'tacticalUnit',
        name: '1. Zug',
        unitType: 'gruppe',
        strength: '1:8',
        ats: '3',
        fremd: true,
      }),
      CTX,
    ) as TacticalUnit;
    expect(item).toEqual({
      type: 'tacticalUnit',
      name: '1. Zug',
      unitType: 'gruppe',
      mann: 9,
      ats: 3,
      alarmierung: NOW.toISOString(),
      datum: NOW.toISOString(),
      lat: 47.9,
      lng: 16.8,
    });
  });

  it('trägt an der Einheit keine Feuerwehr ein — die steckt in der Bezeichnung', () => {
    const item = buildQuickAddItem(
      input({ kind: 'tacticalUnit', name: 'FW Neusiedl', fw: 'Neusiedl am See' }),
      CTX,
    ) as TacticalUnit;
    expect(item.name).toBe('FW Neusiedl');
    expect(item.fw).toBeUndefined();
  });

  it('ordnet ein Fahrzeug der gewählten Einheit zu', () => {
    const item = buildQuickAddItem(
      input({ tacticalUnitId: 'u1' }),
      CTX,
    ) as Fzg;
    expect(item.tacticalUnitId).toBe('u1');
  });

  it('stellt eine Einheit unter die gewählte Einheit', () => {
    const item = buildQuickAddItem(
      input({ kind: 'tacticalUnit', tacticalUnitId: 'b1' }),
      CTX,
    );
    expect(item).toMatchObject({ type: 'tacticalUnit', tacticalUnitId: 'b1' });
  });
});
