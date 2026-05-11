import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectContext } from './collectContext';
import type { Firecall } from '../firebase/firestore';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

describe('collectContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects browser context with firecall metadata', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://x/y', pathname: '/y' },
      innerWidth: 1024,
      innerHeight: 768,
      navigator: { userAgent: 'UA', language: 'de-AT' },
    });

    const ctx = collectContext({
      pathname: '/y',
      firecall: { id: 'fc1', name: 'Einsatz 1' } as Firecall,
      buildId: 'b1',
      database: 'ffndev',
    });

    expect(ctx).toMatchObject({
      url: 'https://x/y',
      pathname: '/y',
      buildId: 'b1',
      database: 'ffndev',
      userAgent: 'UA',
      platform: 'web',
      isNative: false,
      firecallId: 'fc1',
      firecallName: 'Einsatz 1',
      viewport: { width: 1024, height: 768 },
      locale: 'de-AT',
    });
  });

  it('omits firecallId when no firecall', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://x/', pathname: '/' },
      innerWidth: 100,
      innerHeight: 100,
      navigator: { userAgent: 'UA', language: 'de' },
    });
    const ctx = collectContext({ pathname: '/', buildId: '', database: '' });
    expect(ctx.firecallId).toBeUndefined();
    expect(ctx.firecallName).toBeUndefined();
  });
});
