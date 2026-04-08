import { describe, it, expect, beforeEach } from 'vitest';
import { UserSessionCache } from './userSessionCache';

describe('UserSessionCache', () => {
  let cache: UserSessionCache;

  beforeEach(() => {
    cache = new UserSessionCache(1000);
  });

  it('returns undefined for unknown keys', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('caches and returns data', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache.set('uid1', data);
    expect(cache.get('uid1')).toEqual(data);
  });

  it('returns undefined after TTL expires', async () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache = new UserSessionCache(50);
    cache.set('uid1', data);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('uid1')).toBeUndefined();
  });

  it('invalidate removes entry', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache.set('uid1', data);
    cache.invalidate('uid1');
    expect(cache.get('uid1')).toBeUndefined();
  });

  it('tracks known users independently of cache TTL', async () => {
    cache = new UserSessionCache(50);
    cache.markKnownUser('uid1');
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.isKnownUser('uid1')).toBe(true);
  });

  it('set also marks user as known', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache.set('uid1', data);
    expect(cache.isKnownUser('uid1')).toBe(true);
  });
});
