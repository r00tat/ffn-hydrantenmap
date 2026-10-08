import { describe, expect, it } from 'vitest';
import { expiryColor, localTodayIso } from './chargeFormat';

describe('chargeFormat', () => {
  it('liefert das lokale Datum', () => {
    expect(localTodayIso(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08');
    expect(localTodayIso(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
  });

  it('färbt nach Ablaufstatus', () => {
    expect(expiryColor('abgelaufen')).toBe('error.main');
    expect(expiryColor('bald')).toBe('warning.main');
    expect(expiryColor('ok')).toBeUndefined();
  });
});
