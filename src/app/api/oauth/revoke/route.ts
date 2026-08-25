import { NextRequest, NextResponse } from 'next/server';
import {
  ClientResolutionError,
  readClientCredentials,
  resolveClient,
  verifyClientAuthentication,
} from '../../../../server/oauth/clients';
import { getOauthIssuer } from '../../../../server/oauth/issuer';
import { callerKey, checkRateLimit } from '../../../../server/oauth/rateLimit';
import { oauthError } from '../../../../server/oauth/responses';
import { hashToken } from '../../../../server/oauth/secrets';
import { revokeRefreshTokenByHash } from '../../../../server/oauth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Token-Widerruf (RFC 7009).
 *
 * Widerrufbar sind Refresh Tokens. Ein Access Token ist ein signiertes JWT und
 * wird ohne Datenbankabfrage geprüft — es läuft nach spätestens einer Stunde
 * ab. Die Antwort ist nach RFC 7009 Abschnitt 2.2 auch dann `200`, wenn das
 * Token unbekannt war: Der Aufrufer soll daraus nichts über fremde Tokens
 * lernen können.
 */
export async function POST(req: NextRequest) {
  const limit = checkRateLimit(
    callerKey(req.headers, 'oauth-revoke'),
    60,
    60_000,
  );
  if (!limit.allowed) {
    return oauthError('invalid_request', 'too many requests', 429, {
      'retry-after': String(limit.retryAfter),
    });
  }

  const form = new URLSearchParams(await req.text());
  const credentials = readClientCredentials(
    form,
    req.headers.get('authorization'),
  );
  const clientId = credentials.clientId;
  if (!clientId) {
    return oauthError('invalid_client', 'client_id is required', 401);
  }

  try {
    const client = await resolveClient(clientId, await getOauthIssuer());
    verifyClientAuthentication(client, credentials);
  } catch (err) {
    if (err instanceof ClientResolutionError) {
      return oauthError('invalid_client', err.message, 401);
    }
    throw err;
  }

  const token = form.get('token');
  if (token) {
    await revokeRefreshTokenByHash(hashToken(token), clientId).catch((err) =>
      console.error(`oauth revoke failed: ${err}`),
    );
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
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
