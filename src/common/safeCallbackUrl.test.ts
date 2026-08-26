import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './safeCallbackUrl';

describe('safeCallbackUrl', () => {
  it('lässt interne Pfade durch', () => {
    expect(safeCallbackUrl('/api/oauth/authorize?a=1', '/profile')).toBe(
      '/api/oauth/authorize?a=1',
    );
  });

  it('fällt ohne Wert auf die Vorgabe zurück', () => {
    expect(safeCallbackUrl(undefined, '/profile')).toBe('/profile');
    expect(safeCallbackUrl(null, '/profile')).toBe('/profile');
    expect(safeCallbackUrl('', '/profile')).toBe('/profile');
  });

  it('weist absolute URLs ab', () => {
    expect(safeCallbackUrl('https://evil.example/', '/profile')).toBe(
      '/profile',
    );
  });

  it('weist protokoll-relative URLs ab', () => {
    expect(safeCallbackUrl('//evil.example/', '/profile')).toBe('/profile');
    expect(safeCallbackUrl('/\\evil.example/', '/profile')).toBe('/profile');
  });

  it('weist relative Pfade ohne führenden Schrägstrich ab', () => {
    expect(safeCallbackUrl('profile', '/profile')).toBe('/profile');
  });
});
