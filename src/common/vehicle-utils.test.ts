import { describe, expect, it } from 'vitest';
import {
  countCrewByVehicle,
  getEffectiveAts,
  getEffectiveBesatzung,
} from './vehicle-utils';

describe('getEffectiveBesatzung', () => {
  it('returns manual besatzung when set', () => {
    expect(getEffectiveBesatzung('5', 0)).toBe(5);
    expect(getEffectiveBesatzung('3', 8)).toBe(3);
  });

  it('returns crewCount - 1 when besatzung is empty and crew assigned', () => {
    expect(getEffectiveBesatzung(undefined, 6)).toBe(5);
    expect(getEffectiveBesatzung('', 6)).toBe(5);
    expect(getEffectiveBesatzung('0', 6)).toBe(5);
  });

  it('returns 0 when only 1 crew member assigned', () => {
    expect(getEffectiveBesatzung(undefined, 1)).toBe(0);
  });

  it('returns 0 when no besatzung and no crew', () => {
    expect(getEffectiveBesatzung(undefined, 0)).toBe(0);
    expect(getEffectiveBesatzung('', 0)).toBe(0);
  });
});

describe('getEffectiveAts', () => {
  it('returns the manual ats value when set', () => {
    expect(getEffectiveAts(4, 0)).toBe(4);
    expect(getEffectiveAts(4, 2)).toBe(4);
  });

  it('accepts string values from firestore', () => {
    expect(getEffectiveAts('4', 0)).toBe(4);
  });

  it('falls back to the assigned ats crew when no manual value is set', () => {
    expect(getEffectiveAts(undefined, 3)).toBe(3);
    expect(getEffectiveAts(0, 3)).toBe(3);
    expect(getEffectiveAts('', 3)).toBe(3);
  });

  it('returns 0 without manual value and without ats crew', () => {
    expect(getEffectiveAts(undefined, 0)).toBe(0);
    expect(getEffectiveAts(0, 0)).toBe(0);
  });

  it('ignores invalid manual values', () => {
    expect(getEffectiveAts('abc', 2)).toBe(2);
    expect(getEffectiveAts(-1, 2)).toBe(2);
  });
});

describe('countCrewByVehicle', () => {
  it('counts crew and ats per vehicle', () => {
    const { crewCount, atsCount } = countCrewByVehicle([
      { vehicleId: 'v1', funktion: 'Gruppenkommandant' },
      { vehicleId: 'v1', funktion: 'Maschinist' },
      { vehicleId: 'v1', funktion: 'Atemschutzträger' },
      { vehicleId: 'v1', funktion: 'Atemschutzträger' },
      { vehicleId: 'v2', funktion: 'Atemschutzträger' },
    ]);
    expect(crewCount.get('v1')).toBe(4);
    expect(atsCount.get('v1')).toBe(2);
    expect(crewCount.get('v2')).toBe(1);
    expect(atsCount.get('v2')).toBe(1);
  });

  it('ignores unassigned crew members', () => {
    const { crewCount, atsCount } = countCrewByVehicle([
      { vehicleId: null, funktion: 'Atemschutzträger' },
    ]);
    expect(crewCount.size).toBe(0);
    expect(atsCount.size).toBe(0);
  });

  it('returns empty maps for an empty crew list', () => {
    const { crewCount, atsCount } = countCrewByVehicle([]);
    expect(crewCount.size).toBe(0);
    expect(atsCount.size).toBe(0);
  });

  it('does not report ats for vehicles without ats crew', () => {
    const { atsCount } = countCrewByVehicle([
      { vehicleId: 'v1', funktion: 'Feuerwehrmann' },
    ]);
    expect(atsCount.get('v1')).toBeUndefined();
  });
});
