import { describe, expect, it } from 'vitest';
import { descendantIds, parentCandidates, parentMap } from './unit-tree';

const items = [
  { id: 'b1', name: 'KHD Bereitschaft', type: 'tacticalUnit' },
  { id: 'z1', name: '1. Zug', type: 'tacticalUnit', tacticalUnitId: 'b1' },
  { id: 'z2', name: '2. Zug', type: 'tacticalUnit', tacticalUnitId: 'b1' },
  { id: 'v1', name: 'TLF', type: 'vehicle', tacticalUnitId: 'z1' },
];

describe('descendantIds', () => {
  it('liefert alles darunter über alle Ebenen', () => {
    // Tiefe zuerst — so, wie der Baum dasteht
    expect([...descendantIds('b1', items)]).toEqual(['z1', 'v1', 'z2']);
    expect([...descendantIds('v1', items)]).toEqual([]);
  });
});

describe('parentCandidates', () => {
  it('bietet einer Einheit weder sich selbst noch ihre Unter-Einheiten an', () => {
    expect(parentCandidates('b1', items).map((u) => u.id)).toEqual([]);
    expect(parentCandidates('z1', items).map((u) => u.id)).toEqual(['b1', 'z2']);
  });

  it('bietet einem Fahrzeug alle Einheiten an', () => {
    expect(parentCandidates('v1', items).map((u) => u.id)).toEqual(['b1', 'z1', 'z2']);
  });
});

describe('parentMap', () => {
  it('kappt nur die Verweise im Zyklus', () => {
    const parents = parentMap([
      { id: 'a', type: 'tacticalUnit', tacticalUnitId: 'b' },
      { id: 'b', type: 'tacticalUnit', tacticalUnitId: 'a' },
      { id: 'v', type: 'vehicle', tacticalUnitId: 'a' },
      { id: 'w', type: 'vehicle', tacticalUnitId: 'gibt-es-nicht' },
    ]);
    expect([...parents]).toEqual([['v', 'a']]);
  });
});
