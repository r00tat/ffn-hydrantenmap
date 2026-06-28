import { describe, it, expect } from 'vitest';
import {
  roundHoursForBilling,
  calculateItemSum,
  calculateCustomItemSum,
  roundCurrency,
  calculateTotalSum,
  isHourlyRate,
  effectiveStundenForRate,
  recalculateLineItem,
  KostenersatzRate,
  KostenersatzLineItem,
} from './kostenersatz';

function makeRate(overrides: Partial<KostenersatzRate>): KostenersatzRate {
  return {
    id: '0.00',
    version: 'test',
    validFrom: '2023-01-01',
    category: 'A',
    categoryNumber: 1,
    categoryName: 'Test',
    description: 'Test',
    unit: 'je Std',
    price: 100,
    isExtendable: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe('roundCurrency', () => {
  it('rounds to 2 decimal places', () => {
    // 1.005 in IEEE 754 is slightly below 1.005, so Math.round gives 1.00
    expect(roundCurrency(1.005)).toBe(1);
    expect(roundCurrency(1.234)).toBeCloseTo(1.23, 2);
  });

  it('returns whole numbers unchanged', () => {
    expect(roundCurrency(10)).toBe(10);
  });
});

describe('roundHoursForBilling', () => {
  it('returns 0 for 0 or negative hours', () => {
    expect(roundHoursForBilling(0)).toBe(0);
    expect(roundHoursForBilling(-1)).toBe(0);
  });

  it('returns exact hours for whole-hour values', () => {
    expect(roundHoursForBilling(1)).toBe(1);
    expect(roundHoursForBilling(4)).toBe(4);
  });

  it('rounds up to 0.5 for fractions <= 0.5', () => {
    expect(roundHoursForBilling(1.25)).toBe(1.5);
    expect(roundHoursForBilling(1.5)).toBe(1.5);
  });

  it('rounds up to next full hour for fractions > 0.5', () => {
    expect(roundHoursForBilling(1.75)).toBe(2);
    expect(roundHoursForBilling(2.9)).toBe(3);
  });
});

describe('calculateItemSum', () => {
  it('returns 0 when einheiten is 0', () => {
    expect(calculateItemSum(3, 0, 100)).toBe(0);
  });

  it('returns 0 when hours is 0', () => {
    expect(calculateItemSum(0, 2, 100)).toBe(0);
  });

  it('calculates hourly rate for first 4 hours: einheiten × hours × price', () => {
    // 2 units × 3 hours × 100 = 600
    expect(calculateItemSum(3, 2, 100)).toBe(600);
  });

  it('uses pauschal rate at hour 5+ (12h block default)', () => {
    // 5 hours, 1 unit, price=100, pauschal=800 → 1 block = 800
    expect(calculateItemSum(5, 1, 100, 800)).toBe(800);
  });

  it('uses pauschal rate for 2 blocks when hours exceed first block', () => {
    // 13 hours, 1 unit, pauschalHours=12 → 2 blocks × 800 = 1600
    expect(calculateItemSum(13, 1, 100, 800, 12)).toBe(1600);
  });

  it('uses flat pricePauschal when price is 0', () => {
    // Tarif B/10: price=0, pricePauschal=50, einheiten=3 → 150
    expect(calculateItemSum(2, 3, 0, 50)).toBe(150);
  });
});

describe('isHourlyRate', () => {
  it('is hourly when unit contains an hourly indicator', () => {
    expect(isHourlyRate(makeRate({ unit: 'je Std', price: 50 }))).toBe(true);
    expect(isHourlyRate(makeRate({ unit: 'pro Person & h', price: 5 }))).toBe(
      true,
    );
    expect(isHourlyRate(makeRate({ unit: 'EUR/h', price: 5 }))).toBe(true);
  });

  it('is hourly when it has both a per-hour price and a pauschal price', () => {
    expect(
      isHourlyRate(
        makeRate({ unit: 'je Std', price: 100, pricePauschal: 800 }),
      ),
    ).toBe(true);
  });

  it('is NOT hourly for per-unit Verbrauchsmaterial (e.g. pro Sack)', () => {
    // Sack Ölbindemittel (12.05): price per Sack, no pauschal, per-unit
    expect(isHourlyRate(makeRate({ unit: 'pro Sack', price: 49 }))).toBe(false);
    expect(isHourlyRate(makeRate({ unit: 'pro Stück', price: 39 }))).toBe(
      false,
    );
  });
});

describe('effectiveStundenForRate', () => {
  it('returns the given hours for hourly rates', () => {
    expect(effectiveStundenForRate(makeRate({ unit: 'je Std' }), 3)).toBe(3);
  });

  it('always returns 1 for per-unit rates regardless of hours', () => {
    expect(
      effectiveStundenForRate(makeRate({ unit: 'pro Sack', price: 49 }), 3),
    ).toBe(1);
  });
});

describe('recalculateLineItem', () => {
  const baseItem: KostenersatzLineItem = {
    rateId: '12.05',
    einheiten: 1,
    anzahlStunden: 1,
    stundenOverridden: false,
    sum: 0,
  };

  it('does NOT multiply per-unit Verbrauchsmaterial by the default hours', () => {
    // Sack Ölbindemittel: 1 Sack × 49 = 49, even when defaultStunden is 3
    const rate = makeRate({
      id: '12.05',
      unit: 'pro Sack',
      price: 49,
      categoryNumber: 12,
    });
    const result = recalculateLineItem(baseItem, rate, 3);
    expect(result.sum).toBe(49);
    expect(result.anzahlStunden).toBe(1);
  });

  it('applies the default hours to hourly rates', () => {
    const rate = makeRate({ id: '1.01', unit: 'je Std', price: 100 });
    const result = recalculateLineItem(baseItem, rate, 3);
    // 1 unit × 3 hours × 100 = 300
    expect(result.sum).toBe(300);
    expect(result.anzahlStunden).toBe(3);
  });

  it('keeps the overridden hours when stundenOverridden is set', () => {
    const rate = makeRate({ id: '1.01', unit: 'je Std', price: 100 });
    const overridden: KostenersatzLineItem = {
      ...baseItem,
      anzahlStunden: 2,
      stundenOverridden: true,
    };
    const result = recalculateLineItem(overridden, rate, 5);
    // 1 unit × 2 hours × 100 = 200 (override wins over defaultStunden=5)
    expect(result.sum).toBe(200);
    expect(result.anzahlStunden).toBe(2);
  });
});

describe('calculateCustomItemSum', () => {
  it('multiplies quantity by price', () => {
    expect(calculateCustomItemSum(5, 20)).toBe(100);
  });

  it('handles zero quantity', () => {
    expect(calculateCustomItemSum(0, 20)).toBe(0);
  });
});

describe('calculateTotalSum', () => {
  it('sums all items and custom items', () => {
    const items = [
      { sum: 100 } as any,
      { sum: 200 } as any,
    ];
    const customItems = [{ sum: 50 } as any];
    expect(calculateTotalSum(items, customItems)).toBe(350);
  });

  it('returns 0 for empty arrays', () => {
    expect(calculateTotalSum([], [])).toBe(0);
  });
});
