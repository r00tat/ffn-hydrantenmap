import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeRedirect,
  parseAuthorizeParams,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from './authorizeRequest';
import { deriveCodeChallenge } from './pkce';
import type { OAuthClient } from './types';

const RESOURCE = 'https://karte.example/api/mcp';
const ISSUER = 'https://karte.example';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const CHALLENGE = deriveCodeChallenge('v'.repeat(43));

const client: OAuthClient = {
  client_id: 'mcp_abc',
  client_id_issued_at: 0,
  redirect_uris: [REDIRECT, 'http://127.0.0.1:1455/callback'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  application_type: 'web',
  source: 'dcr',
  issuer: ISSUER,
};

function params(overrides: Partial<AuthorizeParams> = {}): AuthorizeParams {
  return {
    responseType: 'code',
    clientId: 'mcp_abc',
    redirectUri: REDIRECT,
    scope: 'einsatz:read',
    state: 'st',
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    resource: RESOURCE,
    ...overrides,
  };
}

function validate(overrides: Partial<AuthorizeParams> = {}, options = {}) {
  return validateAuthorizeRequest(params(overrides), client, {
    resource: RESOURCE,
    ...options,
  });
}

describe('parseAuthorizeParams', () => {
  it('liest alle Parameter', () => {
    const parsed = parseAuthorizeParams(
      new URLSearchParams({
        response_type: 'code',
        client_id: 'c',
        redirect_uri: REDIRECT,
        scope: 'einsatz:read',
        state: 's',
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
        resource: RESOURCE,
      }),
    );
    expect(parsed).toEqual({
      responseType: 'code',
      clientId: 'c',
      redirectUri: REDIRECT,
      scope: 'einsatz:read',
      state: 's',
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      resource: RESOURCE,
    });
  });
});

describe('validateAuthorizeRequest', () => {
  it('nimmt eine gültige Anfrage an', () => {
    expect(validate()).toMatchObject({
      kind: 'ok',
      redirectUri: REDIRECT,
      scopes: ['einsatz:read'],
      codeChallengeMethod: 'S256',
      resource: RESOURCE,
    });
  });

  it('leitet ohne redirect_uri nicht weiter', () => {
    expect(validate({ redirectUri: undefined })).toMatchObject({
      kind: 'fatal',
    });
  });

  it('leitet bei nicht registrierter redirect_uri nicht weiter', () => {
    expect(validate({ redirectUri: 'https://evil.example/cb' })).toMatchObject({
      kind: 'fatal',
      description: expect.stringContaining('not registered'),
    });
  });

  it('nimmt einen abweichenden Loopback-Port an', () => {
    expect(
      validate({ redirectUri: 'http://127.0.0.1:60123/callback' }),
    ).toMatchObject({
      kind: 'ok',
      redirectUri: 'http://127.0.0.1:60123/callback',
    });
  });

  it('weist ein fehlendes code_challenge zurück an den Client', () => {
    expect(validate({ codeChallenge: undefined })).toMatchObject({
      kind: 'redirect-error',
      error: 'invalid_request',
      description: expect.stringContaining('PKCE'),
    });
  });

  it('weist code_challenge_method=plain ab', () => {
    expect(validate({ codeChallengeMethod: 'plain' })).toMatchObject({
      kind: 'redirect-error',
      description: expect.stringContaining('S256'),
    });
  });

  it('weist ein fehlendes code_challenge_method ab (Vorgabe wäre plain)', () => {
    expect(validate({ codeChallengeMethod: undefined })).toMatchObject({
      kind: 'redirect-error',
      description: expect.stringContaining('S256'),
    });
  });

  it('weist ein missgebildetes code_challenge ab', () => {
    expect(validate({ codeChallenge: 'kurz' })).toMatchObject({
      kind: 'redirect-error',
      description: expect.stringContaining('malformed'),
    });
  });

  it('weist einen anderen response_type ab', () => {
    expect(validate({ responseType: 'token' })).toMatchObject({
      kind: 'redirect-error',
      error: 'unsupported_response_type',
    });
  });

  it('weist eine fremde resource ab', () => {
    expect(validate({ resource: 'https://evil.example/api/mcp' })).toMatchObject(
      { kind: 'redirect-error', error: 'invalid_target' },
    );
  });

  it('unterstellt ohne resource den eigenen Bezeichner', () => {
    expect(validate({ resource: undefined })).toMatchObject({
      kind: 'ok',
      resource: RESOURCE,
    });
  });

  it('verlangt resource, wenn so konfiguriert', () => {
    expect(
      validate({ resource: undefined }, { requireResource: true }),
    ).toMatchObject({ kind: 'redirect-error', error: 'invalid_request' });
  });

  it('weist einen unbekannten Scope ab', () => {
    expect(validate({ scope: 'einsatz:read fahrtenbuch:read' })).toMatchObject({
      kind: 'redirect-error',
      error: 'invalid_scope',
    });
  });

  it('setzt ohne scope die Vorgabe ohne Schreibrecht', () => {
    const result = validate({ scope: undefined });
    expect(result).toMatchObject({ kind: 'ok' });
    if (result.kind === 'ok') {
      expect(result.scopes).not.toContain('einsatz:write');
    }
  });

  it('weist einen Client ohne authorization_code-Grant ab', () => {
    const restricted = { ...client, grant_types: ['refresh_token'] };
    expect(
      validateAuthorizeRequest(params(), restricted, { resource: RESOURCE }),
    ).toMatchObject({ kind: 'redirect-error', error: 'unauthorized_client' });
  });
});

describe('buildAuthorizeRedirect', () => {
  it('setzt immer den iss-Parameter (RFC 9207)', () => {
    const url = new URL(
      buildAuthorizeRedirect(REDIRECT, ISSUER, { code: 'c', state: 's' }),
    );
    expect(url.searchParams.get('iss')).toBe(ISSUER);
    expect(url.searchParams.get('code')).toBe('c');
    expect(url.searchParams.get('state')).toBe('s');
  });

  it('lässt undefinierte Parameter weg', () => {
    const url = new URL(
      buildAuthorizeRedirect(REDIRECT, ISSUER, {
        error: 'access_denied',
        state: undefined,
      }),
    );
    expect(url.searchParams.has('state')).toBe(false);
  });

  it('erhält vorhandene Query-Parameter des Ziels', () => {
    const url = new URL(
      buildAuthorizeRedirect('https://claude.ai/cb?x=1', ISSUER, { code: 'c' }),
    );
    expect(url.searchParams.get('x')).toBe('1');
  });
});
