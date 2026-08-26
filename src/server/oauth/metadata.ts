import 'server-only';

import { MCP_SCOPES } from '../../common/mcp/scopes';
import { getOauthEndpoints } from './issuer';

/**
 * Die beiden Discovery-Dokumente.
 *
 * Ein MCP-Client findet den Authorization Server so: Der unauthentifizierte
 * Aufruf von `/api/mcp` antwortet mit `401` und
 * `WWW-Authenticate: Bearer resource_metadata="…"`. Dahinter liegt das
 * RFC-9728-Dokument, das auf den Issuer zeigt; dort holt der Client das
 * RFC-8414-Dokument mit den Endpunkten.
 */

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
  resource_documentation?: string;
}

export async function buildProtectedResourceMetadata(): Promise<ProtectedResourceMetadata> {
  const endpoints = await getOauthEndpoints();
  return {
    resource: endpoints.resource,
    authorization_servers: [endpoints.issuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Einsatzkarte FFN',
    resource_documentation: `${endpoints.issuer}/docs/mcp`,
  };
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  scopes_supported: string[];
  response_types_supported: string[];
  response_modes_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  revocation_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  /** RFC 9207 — der Client muss den `iss` der Response prüfen können. */
  authorization_response_iss_parameter_supported: true;
  /** RFC 8707 — dieser Server verlangt den `resource`-Parameter. */
  resource_indicators_supported: true;
  service_documentation: string;
  /**
   * Spec-Revision 2026-07-28: Client ID Metadata Documents lösen DCR ab. Die
   * Kennzeichnung sagt Clients, dass sie ihre `client_id` auch als HTTPS-URL
   * mitbringen dürfen, statt sich zu registrieren.
   */
  client_id_metadata_document_supported: true;
}

export async function buildAuthorizationServerMetadata(): Promise<AuthorizationServerMetadata> {
  const endpoints = await getOauthEndpoints();
  return {
    issuer: endpoints.issuer,
    authorization_endpoint: endpoints.authorizationEndpoint,
    token_endpoint: endpoints.tokenEndpoint,
    registration_endpoint: endpoints.registrationEndpoint,
    revocation_endpoint: endpoints.revocationEndpoint,
    jwks_uri: endpoints.jwksUri,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic',
    ],
    revocation_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic',
    ],
    // Nur S256. `plain` steht bewusst nicht hier — ein Client, der es
    // beherrschte, dürfte es hier nicht verwenden.
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    resource_indicators_supported: true,
    service_documentation: `${endpoints.issuer}/docs/mcp`,
    client_id_metadata_document_supported: true,
  };
}
