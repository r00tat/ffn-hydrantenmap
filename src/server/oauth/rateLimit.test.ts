import { beforeEach, describe, expect, it } from 'vitest';
import { callerKey, checkRateLimit, resetRateLimits } from './rateLimit';

beforeEach(() => {
  resetRateLimits();
});

describe('checkRateLimit', () => {
  it('lässt bis zum Limit durch', () => {
    const now = 1000;
    expect(checkRateLimit('k', 3, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit('k', 3, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit('k', 3, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit('k', 3, 60_000, now).allowed).toBe(false);
  });

  it('meldet die verbleibenden Aufrufe', () => {
    expect(checkRateLimit('k', 2, 60_000, 1000).remaining).toBe(1);
    expect(checkRateLimit('k', 2, 60_000, 1000).remaining).toBe(0);
  });

  it('setzt nach dem Fenster zurück', () => {
    checkRateLimit('k', 1, 60_000, 1000);
    expect(checkRateLimit('k', 1, 60_000, 1000).allowed).toBe(false);
    expect(checkRateLimit('k', 1, 60_000, 62_000).allowed).toBe(true);
  });

  it('zählt Schlüssel getrennt', () => {
    checkRateLimit('a', 1, 60_000, 1000);
    expect(checkRateLimit('b', 1, 60_000, 1000).allowed).toBe(true);
  });

  it('meldet Retry-After in Sekunden', () => {
    checkRateLimit('k', 1, 60_000, 1000);
    expect(checkRateLimit('k', 1, 60_000, 1000).retryAfter).toBe(60);
  });
});

describe('callerKey', () => {
  it('nimmt den ersten Eintrag aus X-Forwarded-For', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' });
    expect(callerKey(headers, 'register')).toBe('register:1.2.3.4');
  });

  it('fällt ohne Header auf unknown zurück', () => {
    expect(callerKey(new Headers(), 'register')).toBe('register:unknown');
  });
});
