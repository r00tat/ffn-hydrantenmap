import { describe, it, expect } from 'vitest';
import { findMatchingVehicleListRow } from './vehicle-list-matching';
import type { SybosVehicleListRow } from './sybos-vehicle-list';

function row(
  id: string,
  waname: string,
  warufname: string
): SybosVehicleListRow {
  return {
    id,
    waname,
    warufname,
    checkbox: document.createElement('input'),
  };
}

describe('findMatchingVehicleListRow', () => {
  const rows: SybosVehicleListRow[] = [
    row('2006', 'SRF', 'Rüst Neusiedl am See'),
    row('46143', 'RLFA 3000/100', 'RüstLösch Neusiedl am See'),
    row('2004', 'TLFA 4000', 'Tank1 Neusiedl am See'),
    row('61254', 'MTFA', 'MTF Neusiedl am See'),
  ];

  it('matches WAname exactly', () => {
    expect(findMatchingVehicleListRow('SRF', rows)).toBe(rows[0]);
  });

  it('matches WArufname when WAname does not match', () => {
    expect(findMatchingVehicleListRow('Tank1 Neusiedl am See', rows)).toBe(
      rows[2]
    );
  });

  it('prefers WAname over WArufname when both could match different rows', () => {
    const mixed: SybosVehicleListRow[] = [
      row('1', 'MTF Neusiedl am See', 'Kommando'),
      row('2', 'MTFA', 'MTF Neusiedl am See'),
    ];
    expect(findMatchingVehicleListRow('MTF Neusiedl am See', mixed)).toBe(
      mixed[0]
    );
  });

  it('is case-insensitive', () => {
    expect(findMatchingVehicleListRow('srf', rows)).toBe(rows[0]);
    expect(findMatchingVehicleListRow('TANK1 NEUSIEDL AM SEE', rows)).toBe(
      rows[2]
    );
  });

  it('tolerates surrounding whitespace on input', () => {
    expect(findMatchingVehicleListRow('  SRF  ', rows)).toBe(rows[0]);
  });

  it('returns null when nothing matches', () => {
    expect(findMatchingVehicleListRow('XYZ', rows)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(findMatchingVehicleListRow('', rows)).toBeNull();
    expect(findMatchingVehicleListRow('   ', rows)).toBeNull();
  });

  it('ignores empty warufname during matching', () => {
    const sparse: SybosVehicleListRow[] = [row('1', 'Hubstapler', '')];
    expect(findMatchingVehicleListRow('', sparse)).toBeNull();
    expect(findMatchingVehicleListRow('Hubstapler', sparse)).toBe(sparse[0]);
  });

  it('returns null when rows are empty', () => {
    expect(findMatchingVehicleListRow('SRF', [])).toBeNull();
  });
});
