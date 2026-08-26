import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { bearerTokenFromHeader, McpAuthError, mcpAuthChallengeResponse } =
  await import('./mcpUserRequired');

describe('bearerTokenFromHeader', () => {
  it('liest das Token', () => {
    expect(bearerTokenFromHeader('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('ist unabhängig von der Schreibweise', () => {
    expect(bearerTokenFromHeader('bearer abc')).toBe('abc');
  });

  it('liefert nichts ohne Header oder ohne Schema', () => {
    expect(bearerTokenFromHeader(null)).toBeUndefined();
    expect(bearerTokenFromHeader('Basic abc')).toBeUndefined();
    expect(bearerTokenFromHeader('Bearer   ')).toBeUndefined();
  });
});

describe('mcpAuthChallengeResponse', () => {
  const metadata =
    'https://karte.example/.well-known/oauth-protected-resource/api/mcp';

  it('nennt die Resource-Metadaten im WWW-Authenticate-Header', async () => {
    const response = mcpAuthChallengeResponse(
      new McpAuthError('invalid_token', 'a bearer access token is required', 401),
      metadata,
    );
    expect(response.status).toBe(401);
    const header = response.headers.get('www-authenticate');
    expect(header).toContain('Bearer');
    expect(header).toContain(`resource_metadata="${metadata}"`);
    expect(header).toContain('error="invalid_token"');
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_token',
      error_description: 'a bearer access token is required',
    });
  });

  it('nennt bei fehlendem Scope den verlangten Scope', () => {
    const response = mcpAuthChallengeResponse(
      new McpAuthError(
        'insufficient_scope',
        'scope einsatz:write is required',
        403,
        ['einsatz:write'],
      ),
      metadata,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain(
      'scope="einsatz:write"',
    );
  });

  it('bricht den Header nicht mit Anführungszeichen aus der Meldung auf', () => {
    const response = mcpAuthChallengeResponse(
      new McpAuthError('invalid_token', 'token "abc" ist kaputt', 401),
      metadata,
    );
    const header = response.headers.get('www-authenticate') ?? '';
    expect(header).toContain("error_description=\"token 'abc' ist kaputt\"");
  });
});
