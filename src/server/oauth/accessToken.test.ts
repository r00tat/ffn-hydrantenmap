import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { exportPKCS8, generateKeyPair } = await import('jose');
const { resetMcpSigningKeyCache, getMcpJwks } = await import('./signingKey');
const { AccessTokenError, mintAccessToken, verifyAccessToken } = await import(
  './accessToken'
);

const ISSUER = 'https://karte.example';
const RESOURCE = 'https://karte.example/api/mcp';

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  process.env.MCP_OAUTH_SIGNING_KEY = await exportPKCS8(privateKey);
});

beforeEach(() => {
  resetMcpSigningKeyCache();
});

describe('mintAccessToken', () => {
  it('erzeugt ein prüfbares Token mit Scopes und Client', async () => {
    const { token, expiresIn } = await mintAccessToken({
      issuer: ISSUER,
      subject: 'uid-1',
      audience: RESOURCE,
      clientId: 'client-1',
      scopes: ['einsatz:read', 'berechnung'],
    });
    expect(expiresIn).toBe(3600);

    const verified = await verifyAccessToken(token, {
      issuer: ISSUER,
      audience: RESOURCE,
    });
    expect(verified).toMatchObject({
      subject: 'uid-1',
      clientId: 'client-1',
      scopes: ['einsatz:read', 'berechnung'],
    });
    expect(verified.jti).toBeTruthy();
  });

  it('trägt den kid des Signaturschlüssels im Header', async () => {
    const { token } = await mintAccessToken({
      issuer: ISSUER,
      subject: 'uid-1',
      audience: RESOURCE,
      clientId: 'client-1',
      scopes: ['einsatz:read'],
    });
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString(),
    );
    const jwks = await getMcpJwks();
    expect(header.kid).toBe(jwks.keys[0].kid);
    expect(header.typ).toBe('at+jwt');
  });
});

describe('verifyAccessToken', () => {
  async function mint(overrides: Record<string, unknown> = {}) {
    const { token } = await mintAccessToken({
      issuer: ISSUER,
      subject: 'uid-1',
      audience: RESOURCE,
      clientId: 'client-1',
      scopes: ['einsatz:read'],
      ...overrides,
    });
    return token;
  }

  it('weist ein Token für einen fremden Resource Server ab', async () => {
    const token = await mint({ audience: 'https://evil.example/api/mcp' });
    await expect(
      verifyAccessToken(token, { issuer: ISSUER, audience: RESOURCE }),
    ).rejects.toThrow(AccessTokenError);
  });

  it('nimmt einen abweichenden Trailing Slash hin', async () => {
    const token = await mint({ audience: `${RESOURCE}/` });
    await expect(
      verifyAccessToken(token, { issuer: ISSUER, audience: RESOURCE }),
    ).resolves.toMatchObject({ subject: 'uid-1' });
  });

  it('weist einen fremden Issuer ab', async () => {
    const token = await mint({ issuer: 'https://andere.example' });
    await expect(
      verifyAccessToken(token, { issuer: ISSUER, audience: RESOURCE }),
    ).rejects.toThrow(/invalid access token/);
  });

  it('weist ein abgelaufenes Token ab', async () => {
    const token = await mint({
      lifetimeSeconds: 1,
      now: () => Date.now() - 60_000,
    });
    await expect(
      verifyAccessToken(token, { issuer: ISSUER, audience: RESOURCE }),
    ).rejects.toThrow(/invalid access token/);
  });

  it('weist Unsinn ab', async () => {
    await expect(
      verifyAccessToken('nicht.ein.jwt', {
        issuer: ISSUER,
        audience: RESOURCE,
      }),
    ).rejects.toThrow(AccessTokenError);
  });

  it('weist ein Token mit fremder Signatur ab', async () => {
    const token = await mint();
    const { privateKey } = await generateKeyPair('RS256', {
      extractable: true,
    });
    process.env.MCP_OAUTH_SIGNING_KEY = await exportPKCS8(privateKey);
    resetMcpSigningKeyCache();
    await expect(
      verifyAccessToken(token, { issuer: ISSUER, audience: RESOURCE }),
    ).rejects.toThrow(AccessTokenError);
  });
});
