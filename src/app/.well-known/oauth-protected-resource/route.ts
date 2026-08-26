import { buildProtectedResourceMetadata } from '../../../server/oauth/metadata';
import {
  discoveryPreflight,
  discoveryResponse,
} from '../../../server/oauth/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RFC 9728 — Protected Resource Metadata an der Wurzel.
 *
 * Clients, die den Pfad des Resource Servers nicht anhängen, landen hier; die
 * ressourcenspezifische Variante unter `/.well-known/oauth-protected-resource/api/mcp`
 * liefert dasselbe Dokument.
 */
export async function GET() {
  return discoveryResponse(await buildProtectedResourceMetadata());
}

export async function OPTIONS() {
  return discoveryPreflight();
}
