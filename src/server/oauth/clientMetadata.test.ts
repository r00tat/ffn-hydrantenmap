import { describe, expect, it } from 'vitest';
import {
  ClientMetadataError,
  normalizeClientMetadata,
} from './clientMetadata';

const minimal = {
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
};

describe('normalizeClientMetadata', () => {
  it('füllt die Vorgaben', () => {
    const result = normalizeClientMetadata(minimal);
    expect(result).toMatchObject({
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
    });
  });

  it('verlangt redirect_uris', () => {
    expect(() => normalizeClientMetadata({})).toThrow(ClientMetadataError);
    expect(() => normalizeClientMetadata({ redirect_uris: [] })).toThrow(
      /non-empty/,
    );
  });

  it('weist http-Redirects für Web-Clients ab', () => {
    expect(() =>
      normalizeClientMetadata({ redirect_uris: ['http://claude.ai/cb'] }),
    ).toThrow(/not an allowed redirect target/);
  });

  it('nimmt Loopback für native Clients', () => {
    const result = normalizeClientMetadata({
      redirect_uris: ['http://127.0.0.1:1455/cb'],
      application_type: 'native',
    });
    expect(result.redirect_uris).toEqual(['http://127.0.0.1:1455/cb']);
  });

  it('weist unbekannte grant_types ab', () => {
    expect(() =>
      normalizeClientMetadata({ ...minimal, grant_types: ['password'] }),
    ).toThrow(/unsupported values/);
  });

  it('verlangt authorization_code unter den grant_types', () => {
    expect(() =>
      normalizeClientMetadata({ ...minimal, grant_types: ['refresh_token'] }),
    ).toThrow(/must include authorization_code/);
  });

  it('weist unbekannte response_types ab', () => {
    expect(() =>
      normalizeClientMetadata({ ...minimal, response_types: ['token'] }),
    ).toThrow(/unsupported values/);
  });

  it('weist eine unbekannte Client-Authentisierung ab', () => {
    expect(() =>
      normalizeClientMetadata({
        ...minimal,
        token_endpoint_auth_method: 'private_key_jwt',
      }),
    ).toThrow(/unsupported token_endpoint_auth_method/);
  });

  it('filtert unbekannte Scopes aus dem scope-Wunsch', () => {
    const result = normalizeClientMetadata({
      ...minimal,
      scope: 'einsatz:read fahrtenbuch:write',
    });
    expect(result.scope).toBe('einsatz:read');
  });

  it('verlangt https für client_uri und logo_uri', () => {
    expect(() =>
      normalizeClientMetadata({ ...minimal, client_uri: 'http://claude.ai' }),
    ).toThrow(/must use https/);
  });

  it('begrenzt die Anzahl der redirect_uris', () => {
    expect(() =>
      normalizeClientMetadata({
        redirect_uris: Array.from(
          { length: 11 },
          (_, i) => `https://claude.ai/cb${i}`,
        ),
      }),
    ).toThrow(/at most 10/);
  });

  it('weist überlange Zeichenketten ab', () => {
    expect(() =>
      normalizeClientMetadata({ ...minimal, client_name: 'x'.repeat(513) }),
    ).toThrow(/too long/);
  });

  it('weist einen unbekannten application_type ab', () => {
    expect(() =>
      normalizeClientMetadata({ ...minimal, application_type: 'service' }),
    ).toThrow(/application_type/);
  });
});
