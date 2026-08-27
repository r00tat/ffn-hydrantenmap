import { beforeEach, describe, expect, it, vi } from 'vitest';

// Die Route ermittelt die Basis-URL über server/auth/baseUrl, das
// `server-only` importiert — außerhalb des Next-Bundlers wirft das Modul beim
// Laden.
vi.mock('server-only', () => ({}));

const { resolveMock, getBaseUrlMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  getBaseUrlMock: vi.fn(),
}));

vi.mock('../../../../server/oauth/authorizeFlow', () => ({
  resolveAuthorizeRequest: resolveMock,
}));
vi.mock('../../../../server/auth/baseUrl', () => ({
  getBaseUrl: getBaseUrlMock,
}));

import { resetRateLimits } from '../../../../server/oauth/rateLimit';
import { GET } from './route';

/**
 * Ein Request, wie ihn Cloud Run stellt: Der Original-Host steht nur in den
 * Forwarded-Headern, `nextUrl.origin` trägt die interne Container-Adresse.
 */
function makeReq(search = 'client_id=abc') {
  return {
    headers: new Headers({
      host: 'einsatz.example.at',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '203.0.113.7',
    }),
    nextUrl: new URL(`https://0.0.0.0:8080/api/oauth/authorize?${search}`),
  } as any;
}

describe('GET /api/oauth/authorize', () => {
  beforeEach(() => {
    resetRateLimits();
    resolveMock.mockReset();
    getBaseUrlMock.mockReset().mockResolvedValue('https://einsatz.example.at');
  });

  it('leitet zum Consent-Bildschirm auf der öffentlichen Basis-URL weiter', async () => {
    resolveMock.mockResolvedValue({ kind: 'consent', query: 'client_id=abc' });

    const res = await GET(makeReq());

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://einsatz.example.at/oauth/consent?client_id=abc',
    );
  });

  it('leitet zur Anmeldung auf der öffentlichen Basis-URL weiter', async () => {
    resolveMock.mockResolvedValue({
      kind: 'login',
      url: '/login?callbackUrl=%2Fapi%2Foauth%2Fauthorize',
    });

    const res = await GET(makeReq());

    expect(res.headers.get('location')).toBe(
      'https://einsatz.example.at/login?callbackUrl=%2Fapi%2Foauth%2Fauthorize',
    );
  });

  it('zeigt den Fehler auf der öffentlichen Basis-URL an', async () => {
    resolveMock.mockResolvedValue({
      kind: 'error',
      error: 'invalid_client',
      description: 'nope',
    });

    const res = await GET(makeReq());

    expect(res.headers.get('location')).toBe(
      'https://einsatz.example.at/oauth/fehler?error=invalid_client&description=nope',
    );
  });

  it('leitet mit dem Code an die absolute redirect_uri des Clients weiter', async () => {
    resolveMock.mockResolvedValue({
      kind: 'redirect',
      url: 'http://localhost:57998/callback?code=xyz',
    });

    const res = await GET(makeReq());

    expect(res.headers.get('location')).toBe(
      'http://localhost:57998/callback?code=xyz',
    );
  });
});
