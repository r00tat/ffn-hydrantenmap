import { buildProtectedResourceMetadata } from '../../../../../server/oauth/metadata';
import {
  discoveryPreflight,
  discoveryResponse,
} from '../../../../../server/oauth/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RFC 9728 verlangt, dass der Pfad des Resource Servers in der Well-Known-URL
 * gespiegelt wird: Der MCP-Endpunkt liegt unter `/api/mcp`, seine Metadaten
 * also unter `/.well-known/oauth-protected-resource/api/mcp`. Genau diese URL
 * nennt der `WWW-Authenticate`-Header der 401-Antwort.
 */
export async function GET() {
  return discoveryResponse(await buildProtectedResourceMetadata());
}

export async function OPTIONS() {
  return discoveryPreflight();
}
