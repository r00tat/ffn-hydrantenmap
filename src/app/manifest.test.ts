import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEV_TITLE_PREFIX } from '../common/appEnvironment';
import manifest from './manifest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Web-Manifest', () => {
  it('trägt in prod die unveränderten Namen', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    const { name, short_name } = manifest();
    expect(name).toBe('Einsatzkarte FFN');
    expect(short_name).toBe('Einsatzkarte');
  });

  it('kennzeichnet in dev name und short_name', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    const { name, short_name } = manifest();
    expect(name).toBe(`${DEV_TITLE_PREFIX}Einsatzkarte FFN`);
    expect(short_name).toBe(`${DEV_TITLE_PREFIX}Einsatzkarte`);
  });

  it('lässt das Installationsverhalten unberührt', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(manifest()).toMatchObject({
      theme_color: '#1976d2',
      background_color: '#ffffff',
      display: 'standalone',
      scope: '/',
      start_url: '/',
    });
  });

  it('liefert in prod die Icons mit weißem Hintergrund, auch maskable', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    expect(manifest().icons).toEqual([
      {
        src: '/brand/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });

  it('liefert in dev die Icons mit DEV-Band', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    const sources = manifest().icons?.map((icon) => icon.src);
    expect(sources).toEqual([
      '/brand/dev/icon-192.png',
      '/brand/dev/icon-512.png',
      '/brand/dev/icon-maskable-512.png',
    ]);
  });
});
