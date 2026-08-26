import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { authMock, resolveClientMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveClientMock: vi.fn(),
}));
vi.mock('../../app/auth', () => ({ auth: authMock }));
vi.mock('./clients', async () => {
  const actual = await vi.importActual<typeof import('./clients')>('./clients');
  return { ...actual, resolveClient: resolveClientMock };
});
vi.mock('./issuer', () => ({
  getOauthIssuer: async () => 'https://karte.example',
  getMcpResourceUrl: async () => 'https://karte.example/api/mcp',
}));
vi.mock('./store', () => ({
  firestoreAuthCodeStore: () => ({}),
  loadConsent: vi.fn(async () => undefined),
  saveConsent: vi.fn(),
}));

const { resolveAuthorizeRequest } = await import('./authorizeFlow');

const query = new URLSearchParams({
  response_type: 'code',
  client_id: 'https://claude.ai/mcp/client',
  redirect_uri: 'https://claude.ai/cb',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
});

beforeEach(() => {
  authMock.mockReset();
  resolveClientMock.mockReset();
});

describe('resolveAuthorizeRequest', () => {
  it('löst ohne Anmeldung keinen Client-Abruf aus', async () => {
    // Die Auflösung einer CIMD-`client_id` ist ein ausgehender Abruf, dessen
    // Ziel der Aufrufer bestimmt. Ohne Anmeldung darf es dazu nicht kommen.
    authMock.mockResolvedValue(null);

    const outcome = await resolveAuthorizeRequest(query);

    expect(outcome.kind).toBe('login');
    expect(resolveClientMock).not.toHaveBeenCalled();
  });

  it('trägt die unveränderte Anfrage in die Anmeldung', async () => {
    authMock.mockResolvedValue(null);

    const outcome = await resolveAuthorizeRequest(query);

    expect(outcome.kind === 'login' && outcome.url).toContain(
      encodeURIComponent('/api/oauth/authorize?'),
    );
  });

  it('löst auch bei fehlender client_id ohne Anmeldung nichts aus', async () => {
    authMock.mockResolvedValue(null);

    const outcome = await resolveAuthorizeRequest(
      new URLSearchParams({ response_type: 'code' }),
    );

    expect(outcome.kind).toBe('login');
    expect(resolveClientMock).not.toHaveBeenCalled();
  });

  it('löst den Client erst nach der Anmeldung auf', async () => {
    authMock.mockResolvedValue({ user: { id: 'uid-1', isAuthorized: true } });
    resolveClientMock.mockRejectedValue(new Error('kaputt'));

    const outcome = await resolveAuthorizeRequest(query);

    expect(resolveClientMock).toHaveBeenCalledWith(
      'https://claude.ai/mcp/client',
      'https://karte.example',
    );
    expect(outcome.kind).toBe('error');
  });

  it('weist einen Einsatz-Gast ab', async () => {
    authMock.mockResolvedValue({
      user: { id: 'uid-1', isAuthorized: true, firecall: 'call-1' },
    });
    resolveClientMock.mockResolvedValue({
      client_id: 'https://claude.ai/mcp/client',
      client_id_issued_at: 0,
      redirect_uris: ['https://claude.ai/cb'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      source: 'cimd',
      issuer: 'https://karte.example',
    });

    const outcome = await resolveAuthorizeRequest(query);

    expect(outcome.kind === 'redirect' && outcome.url).toContain(
      'error=access_denied',
    );
  });

  it('weist einen nicht autorisierten Benutzer ab', async () => {
    authMock.mockResolvedValue({ user: { id: 'uid-1', isAuthorized: false } });
    resolveClientMock.mockResolvedValue({
      client_id: 'https://claude.ai/mcp/client',
      client_id_issued_at: 0,
      redirect_uris: ['https://claude.ai/cb'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      source: 'cimd',
      issuer: 'https://karte.example',
    });

    const outcome = await resolveAuthorizeRequest(query);

    expect(outcome.kind === 'redirect' && outcome.url).toContain(
      'error=access_denied',
    );
  });
});
