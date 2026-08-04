import { describe, expect, it } from 'vitest';
import { isPublicRoute } from './publicRoutes';

describe('isPublicRoute', () => {
  it('erkennt die Gast-Erfassung als öffentlich', () => {
    expect(isPublicRoute('/fahrtenbuch/teilen/abc123')).toBe(true);
  });

  it('lässt das angemeldete Fahrtenbuch geschützt', () => {
    expect(isPublicRoute('/fahrtenbuch')).toBe(false);
    expect(isPublicRoute('/fahrtenbuch/ffnd/v1')).toBe(false);
  });

  it('lässt die Übersichtsebene ohne Token und abschließenden Schrägstrich geschützt', () => {
    expect(isPublicRoute('/fahrtenbuch/teilen')).toBe(false);
  });

  it('behandelt fehlende Pfade als geschützt', () => {
    expect(isPublicRoute(null)).toBe(false);
    expect(isPublicRoute(undefined)).toBe(false);
    expect(isPublicRoute('')).toBe(false);
  });
});
