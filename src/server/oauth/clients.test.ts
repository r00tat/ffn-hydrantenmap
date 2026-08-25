import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./store', () => ({ loadClient: vi.fn() }));
vi.mock('./cimd', async () => {
  const actual = await vi.importActual<typeof import('./cimd')>('./cimd');
  return { ...actual, fetchClientIdMetadata: vi.fn() };
});

const { loadClient } = await import('./store');
const { fetchClientIdMetadata } = await import('./cimd');
const {
  ClientResolutionError,
  readClientCredentials,
  resolveClient,
  verifyClientAuthentication,
} = await import('./clients');
const { generateOpaqueToken, hashToken } = await import('./secrets');

const ISSUER = 'https://karte.example';

const dcrClient = {
  client_id: 'mcp_abc',
  client_id_issued_at: 0,
  redirect_uris: ['https://claude.ai/cb'],
  grant_types: ['authorization_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none' as const,
  application_type: 'web' as const,
  source: 'dcr' as const,
  issuer: ISSUER,
};

describe('resolveClient', () => {
  it('lädt einen DCR-Client aus dem Store', async () => {
    vi.mocked(loadClient).mockResolvedValue(dcrClient);
    await expect(resolveClient('mcp_abc', ISSUER)).resolves.toMatchObject({
      client_id: 'mcp_abc',
    });
  });

  it('weist einen unbekannten Client ab', async () => {
    vi.mocked(loadClient).mockResolvedValue(undefined);
    await expect(resolveClient('mcp_weg', ISSUER)).rejects.toThrow(
      ClientResolutionError,
    );
  });

  it('weist einen Client eines anderen Issuers ab', async () => {
    vi.mocked(loadClient).mockResolvedValue({
      ...dcrClient,
      issuer: 'https://dev.example',
    });
    await expect(resolveClient('mcp_abc', ISSUER)).rejects.toThrow(
      /different issuer/,
    );
  });

  it('holt CIMD-Clients über ihre URL', async () => {
    vi.mocked(fetchClientIdMetadata).mockResolvedValue({
      ...dcrClient,
      client_id: 'https://claude.ai/c',
      source: 'cimd',
    });
    await expect(
      resolveClient('https://claude.ai/c', ISSUER),
    ).resolves.toMatchObject({ source: 'cimd' });
  });

  it('verpackt einen fehlgeschlagenen CIMD-Abruf als invalid_client', async () => {
    vi.mocked(fetchClientIdMetadata).mockRejectedValue(new Error('kaputt'));
    await expect(resolveClient('https://claude.ai/c', ISSUER)).rejects.toThrow(
      ClientResolutionError,
    );
  });
});

describe('verifyClientAuthentication', () => {
  it('lässt Public Clients ohne Secret durch', () => {
    expect(() => verifyClientAuthentication(dcrClient, {})).not.toThrow();
  });

  it('verlangt bei einem Confidential Client das Secret', () => {
    const secret = generateOpaqueToken();
    const client = {
      ...dcrClient,
      token_endpoint_auth_method: 'client_secret_post' as const,
      client_secret_hash: hashToken(secret),
    };
    expect(() =>
      verifyClientAuthentication(client, { clientSecret: secret }),
    ).not.toThrow();
    expect(() => verifyClientAuthentication(client, {})).toThrow(
      /authentication is required/,
    );
    expect(() =>
      verifyClientAuthentication(client, { clientSecret: 'falsch' }),
    ).toThrow(/authentication failed/);
  });
});

describe('readClientCredentials', () => {
  it('liest aus dem Body', () => {
    const form = new URLSearchParams({
      client_id: 'a',
      client_secret: 'b',
    });
    expect(readClientCredentials(form, null)).toEqual({
      clientId: 'a',
      clientSecret: 'b',
    });
  });

  it('bevorzugt den Basic-Header', () => {
    const form = new URLSearchParams({ client_id: 'body' });
    const header = `Basic ${Buffer.from('header:geheim').toString('base64')}`;
    expect(readClientCredentials(form, header)).toEqual({
      clientId: 'header',
      clientSecret: 'geheim',
    });
  });
});
