import 'server-only';

import { getBaseUrl } from '../auth/baseUrl';

export { matchesResource, normalizeResource } from '../../common/mcp/resource';

/**
 * Der Issuer des Authorization Servers.
 *
 * **Muss die Custom Domain sein, nicht die `run.app`-URL.** Cloud Run kennt
 * die öffentliche Adresse nicht als Umgebungsvariable; `getBaseUrl()` leitet
 * sie aus dem Request ab und prüft sie gegen die Allowlist (siehe
 * `docs/auth-und-origins.md`). Ein falscher Issuer bricht den gesamten Flow:
 * Der Client vergleicht ihn gegen den `iss` in der Authorization Response
 * (RFC 9207) und gegen den `iss`-Claim des Access Tokens.
 */
export async function getOauthIssuer(): Promise<string> {
  return getBaseUrl();
}

/** Der Pfad des MCP-Endpunkts, relativ zum Issuer. */
export const MCP_RESOURCE_PATH = '/api/mcp';

/**
 * Der RFC-8707-Resource-Identifier dieses Servers — der Wert, den ein Client
 * als `resource` mitschickt und der als `aud` in jedem Access Token steht.
 */
export async function getMcpResourceUrl(): Promise<string> {
  return `${await getOauthIssuer()}${MCP_RESOURCE_PATH}`;
}

export interface OauthEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  jwksUri: string;
  resource: string;
}

export async function getOauthEndpoints(): Promise<OauthEndpoints> {
  const issuer = await getOauthIssuer();
  return {
    issuer,
    authorizationEndpoint: `${issuer}/api/oauth/authorize`,
    tokenEndpoint: `${issuer}/api/oauth/token`,
    registrationEndpoint: `${issuer}/api/oauth/register`,
    revocationEndpoint: `${issuer}/api/oauth/revoke`,
    jwksUri: `${issuer}/.well-known/jwks.json`,
    resource: `${issuer}${MCP_RESOURCE_PATH}`,
  };
}
