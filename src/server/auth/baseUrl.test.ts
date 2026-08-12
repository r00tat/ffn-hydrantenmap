import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));

const { requestOrigin, getBaseUrl, rpIdFromOrigin } = await import('./baseUrl');

function withHeaders(entries: Record<string, string>) {
  headersMock.mockResolvedValue({
    get: (name: string) => entries[name.toLowerCase()] ?? null,
  });
}

/** Kein Request-Kontext — genau das wirft `headers()` in Jobs und zur Build-Zeit. */
function withoutRequestScope() {
  headersMock.mockRejectedValue(new Error('called outside a request scope'));
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.PASSKEY_ALLOWED_ORIGINS;
  process.env.NEXTAUTH_URL = 'https://einsatz.ffnd.at';
});

describe('requestOrigin', () => {
  it('builds the origin from the Cloud Run forwarded headers', async () => {
    withHeaders({ host: 'einsatz.ffnd.at', 'x-forwarded-proto': 'https' });
    expect(await requestOrigin()).toBe('https://einsatz.ffnd.at');
  });

  it('prefers x-forwarded-host over the internal run.app host', async () => {
    process.env.PASSKEY_ALLOWED_ORIGINS = 'https://einsatz-dev.ffnd.at';
    withHeaders({
      host: 'ffn-map-abc-ew.a.run.app',
      'x-forwarded-host': 'einsatz-dev.ffnd.at',
      'x-forwarded-proto': 'https',
    });
    expect(await requestOrigin()).toBe('https://einsatz-dev.ffnd.at');
  });

  it('uses the first value when a proxy chains x-forwarded-proto', async () => {
    withHeaders({ host: 'einsatz.ffnd.at', 'x-forwarded-proto': 'https,http' });
    expect(await requestOrigin()).toBe('https://einsatz.ffnd.at');
  });

  it('assumes http for localhost during development', async () => {
    withHeaders({ host: 'localhost:3000' });
    expect(await requestOrigin()).toBe('http://localhost:3000');
  });

  it('rejects an origin that is not on the allowlist', async () => {
    withHeaders({ host: 'evil.example.com', 'x-forwarded-proto': 'https' });
    expect(await requestOrigin()).toBeUndefined();
  });

  it('honours a comma separated PASSKEY_ALLOWED_ORIGINS', async () => {
    process.env.PASSKEY_ALLOWED_ORIGINS =
      'https://a.ffnd.at, https://b.ffnd.at';
    withHeaders({ host: 'b.ffnd.at', 'x-forwarded-proto': 'https' });
    expect(await requestOrigin()).toBe('https://b.ffnd.at');
  });

  it('rejects the NEXTAUTH_URL host once an explicit allowlist is set', async () => {
    process.env.PASSKEY_ALLOWED_ORIGINS = 'https://a.ffnd.at';
    withHeaders({ host: 'einsatz.ffnd.at', 'x-forwarded-proto': 'https' });
    expect(await requestOrigin()).toBeUndefined();
  });

  it('returns undefined outside a request scope', async () => {
    withoutRequestScope();
    expect(await requestOrigin()).toBeUndefined();
  });

  it('returns undefined when no host header is present', async () => {
    withHeaders({});
    expect(await requestOrigin()).toBeUndefined();
  });
});

describe('getBaseUrl', () => {
  it('uses the request origin when available', async () => {
    process.env.PASSKEY_ALLOWED_ORIGINS = 'https://einsatz-dev.ffnd.at';
    withHeaders({ host: 'einsatz-dev.ffnd.at', 'x-forwarded-proto': 'https' });
    expect(await getBaseUrl()).toBe('https://einsatz-dev.ffnd.at');
  });

  it('falls back to NEXTAUTH_URL and trims the trailing slash', async () => {
    process.env.NEXTAUTH_URL = 'https://einsatz.ffnd.at/';
    withoutRequestScope();
    expect(await getBaseUrl()).toBe('https://einsatz.ffnd.at');
  });

  it('falls back to NEXTAUTH_URL when the request origin is not allowed', async () => {
    withHeaders({ host: 'evil.example.com', 'x-forwarded-proto': 'https' });
    expect(await getBaseUrl()).toBe('https://einsatz.ffnd.at');
  });

  it('falls back to localhost when nothing is configured', async () => {
    delete process.env.NEXTAUTH_URL;
    withoutRequestScope();
    expect(await getBaseUrl()).toBe('http://localhost:3000');
  });
});

describe('rpIdFromOrigin', () => {
  it('strips scheme and port', () => {
    expect(rpIdFromOrigin('https://einsatz.ffnd.at')).toBe('einsatz.ffnd.at');
    expect(rpIdFromOrigin('http://localhost:3000')).toBe('localhost');
  });
});
