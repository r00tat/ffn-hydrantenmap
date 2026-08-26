import { NextRequest, NextResponse } from 'next/server';
import {
  ClientMetadataError,
  normalizeClientMetadata,
} from '../../../../server/oauth/clientMetadata';
import { getOauthIssuer } from '../../../../server/oauth/issuer';
import { callerKey, checkRateLimit } from '../../../../server/oauth/rateLimit';
import { oauthError } from '../../../../server/oauth/responses';
import {
  generateId,
  generateOpaqueToken,
  hashToken,
} from '../../../../server/oauth/secrets';
import {
  countRecentRegistrations,
  saveClient,
} from '../../../../server/oauth/store';
import type { OAuthClient } from '../../../../server/oauth/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dynamic Client Registration (RFC 7591).
 *
 * Seit der Spec-Revision 2026-07-28 ist DCR formal deprecated — trotzdem
 * gebaut, weil claude.ai heute genau darüber verbindet. Der Nachfolger CIMD
 * läuft parallel und braucht diesen Endpunkt nicht (siehe `cimd.ts`).
 *
 * Der Endpunkt ist offen, sonst könnte sich niemand registrieren. Die
 * Missbrauchsgrenzen liegen deshalb hier: ein Burst-Limit je Instanz und eine
 * harte Obergrenze je Herkunft und Stunde, die alle Instanzen gemeinsam sehen.
 */

/** Registrierungen je IP in einem 10-Minuten-Fenster, je Instanz. */
const BURST_LIMIT = 10;
const BURST_WINDOW_MS = 10 * 60 * 1000;
/** Registrierungen je IP und Stunde, über alle Instanzen. */
const HOURLY_LIMIT = 20;

export async function POST(req: NextRequest) {
  const key = callerKey(req.headers, 'oauth-register');
  const burst = checkRateLimit(key, BURST_LIMIT, BURST_WINDOW_MS);
  if (!burst.allowed) {
    return oauthError(
      'invalid_request',
      'too many registration attempts',
      429,
      { 'retry-after': String(burst.retryAfter) },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return oauthError('invalid_client_metadata', 'body must be JSON');
  }
  if (!body || typeof body !== 'object') {
    return oauthError('invalid_client_metadata', 'body must be a JSON object');
  }

  let metadata;
  try {
    metadata = normalizeClientMetadata(body as Record<string, unknown>);
  } catch (err) {
    if (err instanceof ClientMetadataError) {
      return oauthError(err.code, err.message);
    }
    throw err;
  }

  const registeredFrom =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const issuedAt = Math.floor(Date.now() / 1000);

  try {
    const recent = await countRecentRegistrations(
      registeredFrom,
      issuedAt - 3600,
    );
    if (recent >= HOURLY_LIMIT) {
      return oauthError(
        'invalid_request',
        'too many registrations from this address',
        429,
        { 'retry-after': '3600' },
      );
    }
  } catch (err) {
    // Die Zählabfrage braucht einen zusammengesetzten Index. Fehlt er, darf
    // das die Registrierung nicht verhindern — das Burst-Limit greift
    // weiterhin.
    console.warn(`oauth register: registration count failed: ${err}`);
  }

  const clientId = generateId('mcp_');
  const client: OAuthClient = {
    ...metadata,
    client_id: clientId,
    client_id_issued_at: issuedAt,
    source: 'dcr',
    issuer: await getOauthIssuer(),
    registered_from: registeredFrom,
  };

  // Ein Client-Secret gibt es nur, wenn der Client ausdrücklich eine
  // Authentisierung verlangt. Einem Public Client eins mitzugeben wäre eine
  // Einladung, es in ein Browser-Bundle zu legen.
  let clientSecret: string | undefined;
  if (metadata.token_endpoint_auth_method !== 'none') {
    clientSecret = generateOpaqueToken();
    client.client_secret_hash = hashToken(clientSecret);
  }

  await saveClient(client);
  console.info(
    `oauth register: ${clientId} (${metadata.client_name ?? 'ohne Namen'}) from ${registeredFrom}`,
  );

  const { client_secret_hash: _hash, registered_from: _from, ...publicClient } =
    client;

  return NextResponse.json(
    {
      ...publicClient,
      ...(clientSecret
        ? { client_secret: clientSecret, client_secret_expires_at: 0 }
        : {}),
    },
    {
      status: 201,
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
        'access-control-allow-origin': '*',
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });
}
