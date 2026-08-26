import 'server-only';

import { hasScopes, type McpScope } from '../../common/mcp/scopes';
import {
  AccessTokenError,
  verifyAccessToken,
} from '../oauth/accessToken';
import { getMcpResourceUrl, getOauthIssuer } from '../oauth/issuer';
import { loadMcpUser, McpUserAccessError, type McpUser } from './userAccess';

/**
 * Der Guard des MCP-Endpunkts.
 *
 * Prüft in dieser Reihenfolge:
 *
 * 1. Signatur, Issuer und **Audience** des Access Tokens. Die `aud`-Prüfung
 *    ist der Confused-Deputy-Schutz: Ein Token für einen anderen Resource
 *    Server ist hier wertlos.
 * 2. Den Benutzer im Benutzerdokument — nicht im Token. Eine entzogene
 *    Berechtigung wirkt sofort und nicht erst nach Ablauf des Tokens.
 * 3. Die Scopes, sofern der Aufrufer welche verlangt.
 *
 * Es wird **kein fremdes Token weitergereicht**: Der Aufruf gegen Firestore
 * läuft über das Admin SDK unter der Identität des Dienstes, die Identität
 * des Benutzers kommt aus dem geprüften `sub`.
 */

export interface McpAuthContext {
  user: McpUser;
  scopes: McpScope[];
  clientId: string;
  /** Anzeigename der Anwendung, aus dem Token — für die Herkunftsmarkierung. */
  clientName?: string;
  /** Ablauf in Sekunden seit Epoch — der MCP-SDK-Guard verlangt ihn. */
  expiresAt: number;
  token: string;
}

export class McpAuthError extends Error {
  readonly status: number;
  readonly code: 'invalid_token' | 'insufficient_scope' | 'invalid_request';
  readonly requiredScopes?: McpScope[];

  constructor(
    code: McpAuthError['code'],
    message: string,
    status: number,
    requiredScopes?: McpScope[],
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.requiredScopes = requiredScopes;
  }
}

export function bearerTokenFromHeader(
  authorization: string | null,
): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || undefined;
}

export async function mcpUserRequired(
  authorization: string | null,
  requiredScopes: McpScope[] = [],
): Promise<McpAuthContext> {
  const token = bearerTokenFromHeader(authorization);
  if (!token) {
    throw new McpAuthError(
      'invalid_token',
      'a bearer access token is required',
      401,
    );
  }

  const [issuer, resource] = await Promise.all([
    getOauthIssuer(),
    getMcpResourceUrl(),
  ]);

  let verified;
  try {
    verified = await verifyAccessToken(token, { issuer, audience: resource });
  } catch (err) {
    throw new McpAuthError(
      'invalid_token',
      err instanceof AccessTokenError ? err.message : 'invalid access token',
      401,
    );
  }

  let user: McpUser;
  try {
    user = await loadMcpUser(verified.subject);
  } catch (err) {
    if (err instanceof McpUserAccessError) {
      throw new McpAuthError('invalid_token', err.message, 403);
    }
    throw err;
  }

  if (requiredScopes.length > 0 && !hasScopes(verified.scopes, requiredScopes)) {
    throw new McpAuthError(
      'insufficient_scope',
      `scope ${requiredScopes.join(' ')} is required`,
      403,
      requiredScopes,
    );
  }

  return {
    user,
    scopes: verified.scopes,
    clientId: verified.clientId,
    clientName: verified.clientName,
    expiresAt: verified.expiresAt,
    token,
  };
}

/**
 * Die Antwort, an der ein Client den Authorization Server findet.
 *
 * `WWW-Authenticate: Bearer resource_metadata="…"` nach RFC 9728 — ohne diesen
 * Header weiß ein Client nach einem 401 nicht, wo er sich anmelden soll, und
 * der ganze Discovery-Pfad bricht ab.
 */
export function mcpAuthChallengeResponse(
  error: McpAuthError,
  resourceMetadataUrl: string,
): Response {
  const parts = [
    `error="${error.code}"`,
    `error_description="${error.message.replace(/"/g, "'")}"`,
    `resource_metadata="${resourceMetadataUrl}"`,
  ];
  if (error.requiredScopes?.length) {
    parts.push(`scope="${error.requiredScopes.join(' ')}"`);
  }
  return new Response(
    JSON.stringify({ error: error.code, error_description: error.message }),
    {
      status: error.status,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer ${parts.join(', ')}`,
        'cache-control': 'no-store',
      },
    },
  );
}
