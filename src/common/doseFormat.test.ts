import { describe, it, expect } from 'vitest';
import { doseRateLevel, formatDose, formatDoseRate } from './doseFormat';

describe('formatDoseRate', () => {
  it('uses µSv/h below 1000', () => {
    expect(formatDoseRate(0.12)).toEqual({ value: '0.12', unit: 'µSv/h' });
    expect(formatDoseRate(999.9)).toEqual({ value: '999.90', unit: 'µSv/h' });
  });
  it('switches to mSv/h at 1000 µSv/h', () => {
    expect(formatDoseRate(1000)).toEqual({ value: '1.00', unit: 'mSv/h' });
    expect(formatDoseRate(1500.5)).toEqual({ value: '1.50', unit: 'mSv/h' });
  });
  it('renders zero as 0.00 µSv/h', () => {
    expect(formatDoseRate(0)).toEqual({ value: '0.00', unit: 'µSv/h' });
  });
});

describe('formatDose', () => {
  it('uses µSv below 1000', () => {
    expect(formatDose(12.34)).toEqual({ value: '12.34', unit: 'µSv' });
  });
  it('switches to mSv at 1000 µSv', () => {
    expect(formatDose(1000)).toEqual({ value: '1.00', unit: 'mSv' });
    expect(formatDose(25_000)).toEqual({ value: '25.00', unit: 'mSv' });
  });
});

describe('doseRateLevel', () => {
  it.each([
    [0.1, 'normal'],
    [0.99, 'normal'],
    [1, 'elevated'],
    [9.9, 'elevated'],
    [10, 'high'],
    [99, 'high'],
    [100, 'critical'],
    [5000, 'critical'],
  ] as const)('classifies %s µSv/h as %s', (input, expected) => {
    expect(doseRateLevel(input)).toBe(expected);
  });
});
