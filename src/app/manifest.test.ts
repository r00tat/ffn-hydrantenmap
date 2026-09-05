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

  it('lässt Installationsverhalten und Icons unberührt', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(manifest()).toMatchObject({
      theme_color: '#1976d2',
      background_color: '#ffffff',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: [{ src: '/app-icon.png', sizes: '144x144', type: 'image/png' }],
    });
  });
});
