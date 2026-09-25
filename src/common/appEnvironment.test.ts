import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appIconPath,
  DEV_TITLE_PREFIX,
  isDevEnvironment,
  withEnvironmentPrefix,
} from './appEnvironment';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isDevEnvironment', () => {
  it('erkennt prod an der leeren Firestore-Datenbank', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    expect(isDevEnvironment()).toBe(false);
  });

  it('erkennt prod, wenn die Variable gar nicht gesetzt ist', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', undefined);
    expect(isDevEnvironment()).toBe(false);
  });

  it('erkennt dev an der Datenbank ffndev', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(isDevEnvironment()).toBe(true);
  });
});

describe('withEnvironmentPrefix', () => {
  it('lässt den Titel in prod unverändert', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    expect(withEnvironmentPrefix('Einsatzkarte FFN')).toBe('Einsatzkarte FFN');
  });

  it('stellt die Kennzeichnung in dev voran', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(withEnvironmentPrefix('Einsatzkarte FFN')).toBe(
      `${DEV_TITLE_PREFIX}Einsatzkarte FFN`
    );
  });

  it('behält das Platzhalter-Token eines Titel-Templates', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(withEnvironmentPrefix('%s - PWA App')).toBe(
      `${DEV_TITLE_PREFIX}%s - PWA App`
    );
  });
});

describe('appIconPath', () => {
  it('liefert in prod die Icons unter /brand', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    expect(appIconPath('icon-192.png')).toBe('/brand/icon-192.png');
  });

  it('liefert in dev die Icons mit DEV-Band unter /brand/dev', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(appIconPath('icon-192.png')).toBe('/brand/dev/icon-192.png');
  });
});
