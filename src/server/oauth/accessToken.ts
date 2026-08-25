import 'server-only';

import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { randomUUID } from 'crypto';
import { formatScopes, parseScopes, type McpScope } from '../../common/mcp/scopes';
import { normalizeResource } from '../../common/mcp/resource';
import { getMcpSigningKey, MCP_SIGNING_ALG } from './signingKey';

/**
 * Access Tokens sind signierte JWTs (RS256).
 *
 * Ein selbstbeschreibendes Token statt eines opaken: Der MCP-Endpunkt kann es
 * ohne Firestore-Read prüfen, was bei jedem einzelnen Tool-Call zählt. Der
 * Preis ist, dass ein Widerruf erst mit dem Ablauf greift — deshalb die kurze
 * Lebensdauer und der Widerruf über das Refresh Token, das den Zugang am Leben
 * hält.
 */

export const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;

export interface McpAccessTokenClaims extends JWTPayload {
  sub: string;
  aud: string;
  scope: string;
  client_id: string;
  jti: string;
}

export interface MintAccessTokenInput {
  issuer: string;
  subject: string;
  audience: string;
  clientId: string;
  /**
   * Anzeigename der Anwendung. Steht als Claim im Token und nicht in einer
   * Firestore-Abfrage: Der MCP-Endpunkt schreibt ihn an jedes erzeugte Element
   * (`mcpClientName`), und dafür bei jedem einzelnen Tool-Call den Client
   * nachzuschlagen wäre ein Firestore-Read je Aufruf.
   */
  clientName?: string;
  scopes: McpScope[];
  lifetimeSeconds?: number;
  now?: () => number;
}

export async function mintAccessToken({
  issuer,
  subject,
  audience,
  clientId,
  clientName,
  scopes,
  lifetimeSeconds = ACCESS_TOKEN_LIFETIME_SECONDS,
  now = Date.now,
}: MintAccessTokenInput): Promise<{ token: string; expiresIn: number; jti: string }> {
  const { privateKey, kid } = await getMcpSigningKey();
  const issuedAt = Math.floor(now() / 1000);
  const jti = randomUUID();

  const token = await new SignJWT({
    scope: formatScopes(scopes),
    client_id: clientId,
    ...(clientName ? { client_name: clientName } : {}),
  })
    .setProtectedHeader({ alg: MCP_SIGNING_ALG, kid, typ: 'at+jwt' })
    .setIssuer(issuer)
    .setSubject(subject)
    // Die Audience ist der Resource Server, nicht der Client. Genau daran
    // scheitert ein Token, das für einen fremden MCP-Server ausgestellt wurde.
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetimeSeconds)
    .setJti(jti)
    .sign(privateKey);

  return { token, expiresIn: lifetimeSeconds, jti };
}

export class AccessTokenError extends Error {}

export interface VerifiedAccessToken {
  subject: string;
  clientId: string;
  clientName?: string;
  scopes: McpScope[];
  /** Ablauf in Sekunden seit Epoch. */
  expiresAt: number;
  audience: string;
  jti: string;
}

/**
 * Prüft ein Access Token gegen den eigenen Issuer **und die eigene Audience**.
 *
 * Die `aud`-Prüfung ist der Confused-Deputy-Schutz aus der Spec: Ein Token,
 * das für einen anderen Resource Server ausgestellt wurde, darf hier nichts
 * bewirken — auch dann nicht, wenn derselbe Authorization Server es signiert
 * hat.
 */
export async function verifyAccessToken(
  token: string,
  { issuer, audience }: { issuer: string; audience: string },
): Promise<VerifiedAccessToken> {
  const { publicKey } = await getMcpSigningKey();

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, publicKey, {
      issuer,
      algorithms: [MCP_SIGNING_ALG],
      // Kein `audience` an jose: Der Vergleich läuft unten normalisiert, weil
      // Clients den Trailing Slash uneinheitlich setzen.
    }));
  } catch (err) {
    throw new AccessTokenError(`invalid access token: ${(err as Error).message}`);
  }

  const audiences = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : [];
  const wanted = normalizeResource(audience);
  if (!audiences.some((value) => normalizeResource(String(value)) === wanted)) {
    throw new AccessTokenError(
      `access token audience ${audiences.join(', ') || '(none)'} does not match ${audience}`,
    );
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new AccessTokenError('access token has no subject');
  }
  if (typeof payload.exp !== 'number') {
    throw new AccessTokenError('access token has no expiry');
  }

  return {
    subject: payload.sub,
    clientId: String(payload.client_id ?? ''),
    clientName:
      typeof payload.client_name === 'string' ? payload.client_name : undefined,
    scopes: parseScopes(typeof payload.scope === 'string' ? payload.scope : ''),
    expiresAt: payload.exp,
    audience: wanted,
    jti: String(payload.jti ?? ''),
  };
}
