import { createMcpHandler } from '@modelcontextprotocol/server';
import { NextRequest } from 'next/server';
import {
  getMcpResourceUrl,
  getOauthIssuer,
} from '../../../server/oauth/issuer';
import { callerKey, checkRateLimit } from '../../../server/oauth/rateLimit';
import { createMcpServerForAuth } from '../../../server/mcp/mcpServer';
import {
  McpAuthError,
  mcpAuthChallengeResponse,
  mcpUserRequired,
} from '../../../server/mcp/mcpUserRequired';

/**
 * Der MCP-Endpunkt.
 *
 * **Streamable HTTP, zustandslos.** Die Spec-Revision 2026-07-28 hat
 * `Mcp-Session-Id` abgeschafft — das Protokoll ist ohne Session-Identifier
 * definiert. Dazu passt der Betrieb auf Cloud Run mit mehreren Instanzen ohne
 * Sticky Sessions: Ein Session-Store (Redis) wäre neue Infrastruktur ohne
 * Gegenwert. `createMcpHandler` bedient daneben die 2025er-Revision über
 * seinen zustandslosen Rückfall, damit ältere Clients nicht ausgesperrt sind.
 *
 * **Kein App Check.** Externe Clients können sich nicht attestieren; die
 * Berechtigung kommt allein aus dem geprüften Access Token.
 *
 * Ein unauthentifizierter Aufruf antwortet mit `401` und
 * `WWW-Authenticate: Bearer resource_metadata="…"` — daran findet der Client
 * den Authorization Server.
 */

// firebase-admin, der Secret Manager und die Markdown-Resources brauchen Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Cloud Run bricht länger laufende Anfragen selbst ab; 60 s decken auch einen
// Tool-Call mit Geocoding und mehreren Firestore-Abfragen ab.
export const maxDuration = 60;

/** Aufrufe je Adresse und Minute. */
const MCP_RATE_LIMIT = 120;
const MCP_RATE_WINDOW_MS = 60_000;

async function handle(req: NextRequest): Promise<Response> {
  // Die Basis ist der Issuer (die öffentliche Custom Domain), nicht
  // `req.nextUrl.origin`: hinter Cloud Run steht dort die interne
  // Container-Adresse (`https://0.0.0.0:8080`). Ein Client, der dem
  // `WWW-Authenticate`-Header folgt, käme damit nirgends an.
  const resourceMetadataUrl = new URL(
    '/.well-known/oauth-protected-resource/api/mcp',
    await getOauthIssuer(),
  ).toString();

  let auth;
  try {
    auth = await mcpUserRequired(req.headers.get('authorization'));
  } catch (err) {
    if (err instanceof McpAuthError) {
      return mcpAuthChallengeResponse(err, resourceMetadataUrl);
    }
    throw err;
  }

  // Erst nach der Authentisierung zählen, und je Benutzer statt je Adresse:
  // Mehrere Benutzer hinter einer Adresse sollen sich nicht gegenseitig
  // aussperren.
  const limit = checkRateLimit(
    `mcp:${auth.user.uid}`,
    MCP_RATE_LIMIT,
    MCP_RATE_WINDOW_MS,
  );
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({
        error: 'rate_limited',
        error_description: 'too many requests',
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(limit.retryAfter),
        },
      },
    );
  }

  // Der Handler wird je Anfrage gebaut: Er trägt die Identität des Aufrufers,
  // und zwischen zwei Anfragen gibt es nichts zu behalten.
  const handler = createMcpHandler(() => createMcpServerForAuth(auth), {
    onerror: (error) => console.error(`mcp handler error: ${error.message}`),
  });

  // Kein `handler.close()` danach: `fetch` liefert die Antwort, deren Body bei
  // einer SSE-Antwort noch läuft — `close()` bricht genau die laufenden
  // Austausche ab. Zu schließen gibt es hier auch nichts: Der Handler hält nur
  // für offene Subscription-Streams einen Keepalive-Timer, und solche werden
  // nicht angeboten.
  return handler.fetch(req, {
    authInfo: {
      token: auth.token,
      clientId: auth.clientId,
      scopes: auth.scopes,
      expiresAt: auth.expiresAt,
      resource: new URL(await getMcpResourceUrl()),
    },
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

/**
 * GET und DELETE gehören zur 2025er-Sitzungsverwaltung. Der zustandslose
 * Rückfall im SDK beantwortet sie mit `405`; unauthentifiziert kommt hier
 * vorher der 401 mit dem `WWW-Authenticate`-Header — und genau den brauchen
 * Clients, die die Discovery über einen GET auf den Endpunkt beginnen.
 */
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers':
        'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
      'access-control-expose-headers': 'www-authenticate, mcp-protocol-version',
      'access-control-max-age': '86400',
    },
  });
}
