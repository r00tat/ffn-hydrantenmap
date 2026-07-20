import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFx, parseVehicleResult } from './parseVehicleData';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('parseFx', () => {
  it('extracts the hidden fx CSRF token from the Einsatz form', () => {
    const fx = parseFx(fixture('einsatz-form.html'));
    expect(fx).toBeTruthy();
    expect(typeof fx).toBe('string');
    expect((fx as string).length).toBeGreaterThan(10);
  });

  it('returns null when no fx field is present', () => {
    expect(parseFx('<html><body><form></form></body></html>')).toBeNull();
  });
});

describe('parseVehicleResult', () => {
  it('parses a single vehicle result', () => {
    const result = parseVehicleResult(fixture('uebung-result-single.html'));
    expect(result.noResult).toBe(false);
    expect(result.vehicles).toHaveLength(1);
    const v = result.vehicles[0];
    expect(v.antrieb).toBe('Elektro');
    expect(v.marke).toBe('TESLA');
    expect(v.name).toBe('Model 3');
    expect(v.type).toBe('003');
    expect(v.hoechstMasse).toBe('2305');
    expect(v.erstzulassung).toBe('2019-06-27');
    expect(v.fin).toBe('5YJ3E7EB3KF312345');
    expect(v.variante).toBe('E3D');
    expect(v.version).toBe('Pp2N');
  });

  it('parses two vehicles for Wechselkennzeichen', () => {
    const result = parseVehicleResult(fixture('uebung-result-wechsel.html'));
    expect(result.noResult).toBe(false);
    expect(result.vehicles).toHaveLength(2);
    expect(result.vehicles[0].marke).toBe('VOLKSWAGEN');
    expect(result.vehicles[0].antrieb).toBe('Diesel');
    expect(result.vehicles[1].marke).toBe('AUDI');
    expect(result.vehicles[1].antrieb).toBe('Benzin');
  });

  it('reports no result when the registration table is absent', () => {
    const result = parseVehicleResult(fixture('uebung-result-empty.html'));
    expect(result.noResult).toBe(true);
    expect(result.vehicles).toHaveLength(0);
  });
});
