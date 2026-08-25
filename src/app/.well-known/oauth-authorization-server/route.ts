import { buildAuthorizationServerMetadata } from '../../../server/oauth/metadata';
import {
  discoveryPreflight,
  discoveryResponse,
} from '../../../server/oauth/responses';

// firebase-admin und Secret Manager laufen nicht in der Edge-Runtime, und der
// Issuer wird aus dem Request abgeleitet — beides erzwingt Node und dynamisch.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 8414 — Authorization Server Metadata. */
export async function GET() {
  return discoveryResponse(await buildAuthorizationServerMetadata());
}

export async function OPTIONS() {
  return discoveryPreflight();
}
