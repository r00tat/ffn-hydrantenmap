import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

const createTokenMock = vi.hoisted(() => vi.fn());
const getAppCheckMock = vi.hoisted(() =>
  vi.fn(() => ({ createToken: createTokenMock }))
);

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: getAppCheckMock,
}));

vi.mock('./admin', () => ({
  firebaseApp: { name: 'admin-app' },
}));

import { createAppCheckToken, resolveAppCheckAppId } from './appCheck';

const WEB_APP_ID = '1:429163084278:web:e25aeca80df74c5f292fd7';
const FIREBASE_CONFIG = JSON.stringify({
  apiKey: 'test-key',
  projectId: 'ffn-utils',
  appId: WEB_APP_ID,
});

describe('resolveAppCheckAppId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers an explicitly configured app id', () => {
    vi.stubEnv('APPCHECK_APP_ID', '1:1:web:explicit');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APIKEY', FIREBASE_CONFIG);

    expect(resolveAppCheckAppId()).toBe('1:1:web:explicit');
  });

  it('falls back to the appId from the Firebase web config', () => {
    vi.stubEnv('APPCHECK_APP_ID', '');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APIKEY', FIREBASE_CONFIG);

    expect(resolveAppCheckAppId()).toBe(WEB_APP_ID);
  });

  it('throws when neither source provides an app id', () => {
    vi.stubEnv('APPCHECK_APP_ID', '');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APIKEY', '{}');

    expect(() => resolveAppCheckAppId()).toThrow(/app id/i);
  });

  it('throws instead of crashing on an unparsable Firebase config', () => {
    vi.stubEnv('APPCHECK_APP_ID', '');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APIKEY', 'not json');

    expect(() => resolveAppCheckAppId()).toThrow(/app id/i);
  });
});

describe('createAppCheckToken', () => {
  beforeEach(() => {
    createTokenMock.mockReset().mockResolvedValue({
      token: 'minted-app-check-token',
      ttlMillis: 1800000,
    });
    getAppCheckMock.mockClear();
    vi.stubEnv('APPCHECK_APP_ID', '');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APIKEY', FIREBASE_CONFIG);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('mints a token for the resolved app id', async () => {
    const result = await createAppCheckToken();

    expect(createTokenMock).toHaveBeenCalledWith(WEB_APP_ID, {
      ttlMillis: 1800000,
    });
    expect(result.token).toBe('minted-app-check-token');
  });

  it('converts the ttl into an absolute expiry the client SDK expects', async () => {
    const result = await createAppCheckToken();

    expect(result.expireTimeMillis).toBe(
      new Date('2026-07-31T12:30:00.000Z').getTime()
    );
  });
});
