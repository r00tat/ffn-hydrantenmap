import {
  DEFAULT_MCP_SCOPES,
  parseScopesStrict,
  type McpScope,
} from '../../common/mcp/scopes';
import { matchesResource } from '../../common/mcp/resource';
import { matchRedirectUri } from './redirectUri';
import type { OAuthClient } from './types';

/**
 * Prüfung einer Authorization Request (RFC 6749 Abschnitt 4.1.1) samt PKCE
 * (RFC 7636) und Resource Indicator (RFC 8707).
 *
 * Zwei Fehlerklassen, und der Unterschied ist sicherheitsrelevant:
 *
 * - **fatal** — `client_id` oder `redirect_uri` sind unbrauchbar. Hier darf
 *   *nicht* weitergeleitet werden: Ein nicht verifiziertes Redirect-Ziel wäre
 *   eine offene Weiterleitung. Der Fehler wird angezeigt.
 * - **redirect** — alles andere. Das Ziel ist verifiziert, der Fehler geht
 *   nach RFC 6749 Abschnitt 4.1.2.1 als `error` dorthin zurück.
 */

export interface AuthorizeParams {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  resource?: string;
}

export function parseAuthorizeParams(
  params: URLSearchParams,
): AuthorizeParams {
  return {
    responseType: params.get('response_type') ?? undefined,
    clientId: params.get('client_id') ?? undefined,
    redirectUri: params.get('redirect_uri') ?? undefined,
    scope: params.get('scope') ?? undefined,
    state: params.get('state') ?? undefined,
    codeChallenge: params.get('code_challenge') ?? undefined,
    codeChallengeMethod: params.get('code_challenge_method') ?? undefined,
    resource: params.get('resource') ?? undefined,
  };
}

export type AuthorizeValidation =
  | { kind: 'fatal'; error: string; description: string }
  | {
      kind: 'redirect-error';
      redirectUri: string;
      state?: string;
      error: string;
      description: string;
    }
  | {
      kind: 'ok';
      client: OAuthClient;
      redirectUri: string;
      state?: string;
      scopes: McpScope[];
      codeChallenge: string;
      codeChallengeMethod: string;
      resource: string;
    };

export interface ValidateAuthorizeOptions {
  /** Der eigene Resource-Identifier — `aud` jedes daraus entstehenden Tokens. */
  resource: string;
  /**
   * Fehlt der `resource`-Parameter, wird der eigene Bezeichner unterstellt.
   * Die Spec verlangt ihn; ältere Clients schicken ihn aber nicht, und ein
   * harter Abbruch machte den Server für sie unbenutzbar. Unterstellt wird
   * ausschließlich der eigene Bezeichner — ein *falscher* Wert bleibt ein
   * Fehler.
   */
  requireResource?: boolean;
}

export function validateAuthorizeRequest(
  params: AuthorizeParams,
  client: OAuthClient,
  { resource, requireResource = false }: ValidateAuthorizeOptions,
): AuthorizeValidation {
  if (!params.redirectUri) {
    // RFC 6749 lässt eine fehlende redirect_uri zu, wenn genau eine
    // registriert ist. Hier wird sie trotzdem verlangt: Der Vorteil der
    // Kulanz ist gering, das Risiko einer Verwechslung bei mehreren
    // registrierten URIs nicht.
    return {
      kind: 'fatal',
      error: 'invalid_request',
      description: 'redirect_uri is required',
    };
  }

  const redirectUri = matchRedirectUri(
    params.redirectUri,
    client.redirect_uris,
  );
  if (!redirectUri) {
    return {
      kind: 'fatal',
      error: 'invalid_request',
      description: 'redirect_uri is not registered for this client',
    };
  }

  const fail = (error: string, description: string): AuthorizeValidation => ({
    kind: 'redirect-error',
    redirectUri,
    state: params.state,
    error,
    description,
  });

  if (params.responseType !== 'code') {
    return fail(
      'unsupported_response_type',
      'only response_type=code is supported',
    );
  }

  if (!client.response_types.includes('code')) {
    return fail('unauthorized_client', 'client may not use response_type=code');
  }
  if (!client.grant_types.includes('authorization_code')) {
    return fail(
      'unauthorized_client',
      'client may not use the authorization_code grant',
    );
  }

  // PKCE ist Pflicht. Ohne Challenge ließe sich ein abgefangener Code
  // einlösen; `plain` schützt davor nicht, weil Verifier und Challenge dann
  // identisch sind.
  if (!params.codeChallenge) {
    return fail('invalid_request', 'code_challenge is required (PKCE, S256)');
  }
  if ((params.codeChallengeMethod ?? 'plain') !== 'S256') {
    return fail(
      'invalid_request',
      'only code_challenge_method=S256 is supported',
    );
  }
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(params.codeChallenge)) {
    return fail('invalid_request', 'code_challenge is malformed');
  }

  if (params.resource) {
    if (!matchesResource(params.resource, resource)) {
      return fail(
        'invalid_target',
        `resource ${params.resource} is not served by this authorization server`,
      );
    }
  } else if (requireResource) {
    return fail('invalid_request', 'resource is required (RFC 8707)');
  }

  const { scopes, unknown } = parseScopesStrict(params.scope);
  if (unknown.length > 0) {
    return fail('invalid_scope', `unknown scope: ${unknown.join(' ')}`);
  }
  const effective = scopes.length > 0 ? scopes : DEFAULT_MCP_SCOPES;

  return {
    kind: 'ok',
    client,
    redirectUri,
    state: params.state,
    scopes: effective,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: 'S256',
    resource,
  };
}

/**
 * Baut die Weiterleitung zurück zum Client.
 *
 * `iss` ist ab RFC 9207 Pflicht — ohne ihn kann ein Client nicht erkennen,
 * von welchem Authorization Server eine Antwort stammt, und ein Angreifer
 * könnte eine Antwort seines eigenen Servers unterschieben (Mix-Up-Angriff).
 */
export function buildAuthorizeRedirect(
  redirectUri: string,
  issuer: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('iss', issuer);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
