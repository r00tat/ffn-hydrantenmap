import { describe, expect, it } from 'vitest';
import { appTheme, BRAND_ACCENT, BRAND_PRIMARY } from './theme';

describe('appTheme', () => {
  it('führt das Blau des Logos als Hauptfarbe', () => {
    expect(BRAND_PRIMARY).toBe('#1976d2');
    expect(appTheme.palette.primary.main).toBe(BRAND_PRIMARY);
  });

  it('behält Rot den Fehlern und Warnungen vor', () => {
    expect(BRAND_ACCENT).toBe('#d32f2f');
    expect(appTheme.palette.error.main).toBe(BRAND_ACCENT);
  });

  // Rot ist nur Markenakzent. Wäre secondary rot, sähen normale Aktionen wie
  // Warnungen aus, und seriesColor() hätte zwei gleiche Reihenfarben.
  it('verwendet für secondary keine Fehlerfarbe', () => {
    expect(appTheme.palette.secondary.main).not.toBe(
      appTheme.palette.error.main
    );
  });
});
