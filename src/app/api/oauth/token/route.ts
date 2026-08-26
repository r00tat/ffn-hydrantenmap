import { NextRequest, NextResponse } from 'next/server';
import { formatScopes, parseScopes } from '../../../../common/mcp/scopes';
import { matchesResource } from '../../../../common/mcp/resource';
import {
  ACCESS_TOKEN_LIFETIME_SECONDS,
  mintAccessToken,
} from '../../../../server/oauth/accessToken';
import { AuthCodeError, consumeAuthCode } from '../../../../server/oauth/authCodes';
import {
  ClientResolutionError,
  readClientCredentials,
  resolveClient,
  verifyClientAuthentication,
} from '../../../../server/oauth/clients';
import {
  getMcpResourceUrl,
  getOauthIssuer,
} from '../../../../server/oauth/issuer';
import { callerKey, checkRateLimit } from '../../../../server/oauth/rateLimit';
import {
  issueRefreshToken,
  RefreshTokenError,
  rotateRefreshToken,
} from '../../../../server/oauth/refreshTokens';
import { oauthError, tokenResponse } from '../../../../server/oauth/responses';
import { generateId, hashToken } from '../../../../server/oauth/secrets';
import {
  firestoreAuthCodeStore,
  firestoreRefreshTokenStore,
  revokeApplicationAccess,
  touchRefreshToken,
} from '../../../../server/oauth/store';
import {
  loadMcpUser,
  McpUserAccessError,
} from '../../../../server/mcp/userAccess';
import type { OAuthClient } from '../../../../server/oauth/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aufrufe je Adresse und Minute — Schutz gegen das Durchprobieren von Codes. */
const TOKEN_RATE_LIMIT = 60;
const TOKEN_RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const limit = checkRateLimit(
    callerKey(req.headers, 'oauth-token'),
    TOKEN_RATE_LIMIT,
    TOKEN_RATE_WINDOW_MS,
  );
  if (!limit.allowed) {
    return oauthError('invalid_request', 'too many requests', 429, {
      'retry-after': String(limit.retryAfter),
    });
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await req.text());
  } catch {
    return oauthError('invalid_request', 'body must be form-encoded');
  }

  const credentials = readClientCredentials(
    form,
    req.headers.get('authorization'),
  );
  const clientId = credentials.clientId ?? form.get('client_id') ?? undefined;
  if (!clientId) {
    return oauthError('invalid_client', 'client_id is required', 401);
  }

  const issuer = await getOauthIssuer();
  let client: OAuthClient;
  try {
    client = await resolveClient(clientId, issuer);
    verifyClientAuthentication(client, credentials);
  } catch (err) {
    if (err instanceof ClientResolutionError) {
      return oauthError('invalid_client', err.message, 401);
    }
    throw err;
  }

  const grantType = form.get('grant_type');
  if (grantType === 'authorization_code') {
    return handleAuthorizationCode(form, client, issuer);
  }
  if (grantType === 'refresh_token') {
    return handleRefreshToken(form, client, issuer);
  }
  return oauthError(
    'unsupported_grant_type',
    `grant_type ${grantType ?? '(missing)'} is not supported`,
  );
}

async function handleAuthorizationCode(
  form: URLSearchParams,
  client: OAuthClient,
  issuer: string,
): Promise<NextResponse> {
  const code = form.get('code');
  const redirectUri = form.get('redirect_uri');
  if (!code || !redirectUri) {
    return oauthError('invalid_request', 'code and redirect_uri are required');
  }

  const resource = await getMcpResourceUrl();
  const requestedResource = form.get('resource');
  if (requestedResource && !matchesResource(requestedResource, resource)) {
    return oauthError(
      'invalid_target',
      `resource ${requestedResource} is not served by this authorization server`,
    );
  }

  let record;
  try {
    record = await consumeAuthCode({
      store: firestoreAuthCodeStore(),
      code,
      clientId: client.client_id,
      redirectUri,
      codeVerifier: form.get('code_verifier') ?? undefined,
      resource: requestedResource ? resource : undefined,
    });
  } catch (err) {
    if (err instanceof AuthCodeError) {
      if (err.reuseDetected && err.userId && err.clientId) {
        // RFC 6749 Abschnitt 4.1.2: Wird ein Code zweimal eingelöst, sollen
        // alle daraus entstandenen Tokens widerrufen werden — der erste
        // Einlöser war womöglich nicht der rechtmäßige Client.
        await revokeApplicationAccess(err.userId, err.clientId).catch(
          (revokeErr) =>
            console.error(`oauth token: revoke after code reuse failed: ${revokeErr}`),
        );
        console.warn(
          `oauth token: authorization code reuse for ${err.clientId} / ${err.userId} — access revoked`,
        );
      }
      return oauthError('invalid_grant', err.message);
    }
    throw err;
  }

  // Der Code kann Minuten alt sein und die Einwilligung Wochen. Ob der
  // Benutzer *jetzt* noch berechtigt ist, entscheidet das Benutzerdokument.
  try {
    await loadMcpUser(record.userId);
  } catch (err) {
    if (err instanceof McpUserAccessError) {
      return oauthError('invalid_grant', err.message);
    }
    throw err;
  }

  const { token: accessToken, expiresIn } = await mintAccessToken({
    issuer,
    subject: record.userId,
    audience: resource,
    clientId: client.client_id,
    clientName: client.client_name,
    scopes: record.scopes,
  });

  const { token: refreshToken } = await issueRefreshToken({
    store: firestoreRefreshTokenStore(),
    familyId: generateId('fam_'),
    clientId: client.client_id,
    clientName: client.client_name,
    userId: record.userId,
    scopes: record.scopes,
    resource,
  });

  return tokenResponse({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: formatScopes(record.scopes),
  });
}

async function handleRefreshToken(
  form: URLSearchParams,
  client: OAuthClient,
  issuer: string,
): Promise<NextResponse> {
  const presented = form.get('refresh_token');
  if (!presented) {
    return oauthError('invalid_request', 'refresh_token is required');
  }

  const resource = await getMcpResourceUrl();
  const requestedResource = form.get('resource');
  if (requestedResource && !matchesResource(requestedResource, resource)) {
    return oauthError(
      'invalid_target',
      `resource ${requestedResource} is not served by this authorization server`,
    );
  }

  const requestedScope = form.get('scope');
  let rotated;
  try {
    rotated = await rotateRefreshToken({
      store: firestoreRefreshTokenStore(),
      presentedToken: presented,
      clientId: client.client_id,
      requestedScopes: requestedScope ? parseScopes(requestedScope) : undefined,
    });
  } catch (err) {
    if (err instanceof RefreshTokenError) {
      if (err.reuseDetected) {
        console.warn(
          `oauth token: refresh token reuse for ${client.client_id} — token family revoked`,
        );
      }
      return oauthError('invalid_grant', err.message);
    }
    throw err;
  }

  try {
    await loadMcpUser(rotated.record.userId);
  } catch (err) {
    if (err instanceof McpUserAccessError) {
      return oauthError('invalid_grant', err.message);
    }
    throw err;
  }

  const { token: accessToken, expiresIn } = await mintAccessToken({
    issuer,
    subject: rotated.record.userId,
    audience: resource,
    clientId: client.client_id,
    clientName: client.client_name,
    scopes: rotated.record.scopes,
  });

  await touchRefreshToken(hashToken(rotated.token));

  return tokenResponse({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn ?? ACCESS_TOKEN_LIFETIME_SECONDS,
    refresh_token: rotated.token,
    scope: formatScopes(rotated.record.scopes),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400',
    },
  });
}
