import { describe, it, expect } from 'vitest';
import { findMatchingVehicleOption } from './vehicle-matching';

function createOption(value: string, text: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

const defaultOptions = [
  createOption('0', '-'),
  createOption('57738', 'KDTFA (Kommando Neusiedl am See)'),
  createOption('30873', 'KRF-S (Kleinrüst Neusiedl am See)'),
  createOption('2802', 'Öl Einachsanhänger'),
];

describe('findMatchingVehicleOption', () => {
  it('matches prefix with parenthesized descriptor', () => {
    const result = findMatchingVehicleOption('KDTFA', defaultOptions);
    expect(result).toBe(defaultOptions[1]);
  });

  it('matches a different vehicle correctly', () => {
    const result = findMatchingVehicleOption('KRF-S', defaultOptions);
    expect(result).toBe(defaultOptions[2]);
  });

  it('matches exact full text without parenthesis', () => {
    const result = findMatchingVehicleOption('Öl Einachsanhänger', defaultOptions);
    expect(result).toBe(defaultOptions[3]);
  });

  it('matches case-insensitive', () => {
    const result = findMatchingVehicleOption('kdtfa', defaultOptions);
    expect(result).toBe(defaultOptions[1]);
  });

  it('skips placeholder option with value "0"', () => {
    const options = [
      createOption('0', 'KDTFA'),
      createOption('57738', 'KDTFA (Kommando Neusiedl am See)'),
    ];
    const result = findMatchingVehicleOption('KDTFA', options);
    expect(result).toBe(options[1]);
  });

  it('skips option with empty value', () => {
    const options = [
      createOption('', 'KDTFA'),
      createOption('57738', 'KDTFA (Kommando Neusiedl am See)'),
    ];
    const result = findMatchingVehicleOption('KDTFA', options);
    expect(result).toBe(options[1]);
  });

  it('returns null if no match', () => {
    const result = findMatchingVehicleOption('XYZ', defaultOptions);
    expect(result).toBeNull();
  });

  it('returns null for empty vehicleName', () => {
    expect(findMatchingVehicleOption('', defaultOptions)).toBeNull();
  });

  it('returns null for whitespace-only vehicleName', () => {
    expect(findMatchingVehicleOption('   ', defaultOptions)).toBeNull();
  });

  it('handles whitespace in option text', () => {
    const options = [
      createOption('0', '-'),
      createOption('57738', '  KDTFA (Kommando Neusiedl am See)  '),
    ];
    const result = findMatchingVehicleOption('KDTFA', options);
    expect(result).toBe(options[1]);
  });

  it('handles whitespace in vehicleName', () => {
    const result = findMatchingVehicleOption('  KDTFA  ', defaultOptions);
    expect(result).toBe(defaultOptions[1]);
  });

  it('returns null for empty options array', () => {
    expect(findMatchingVehicleOption('KDTFA', [])).toBeNull();
  });
});
