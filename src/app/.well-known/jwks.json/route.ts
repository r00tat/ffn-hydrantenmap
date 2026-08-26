import { getMcpJwks } from '../../../server/oauth/signingKey';
import {
  discoveryPreflight,
  discoveryResponse,
} from '../../../server/oauth/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Der öffentliche Signaturschlüssel (RFC 7517).
 *
 * Access Tokens sind signierte JWTs; wer sie prüfen will, ohne den Server zu
 * fragen, braucht diesen Schlüssel. Der `kid` ist der Thumbprint des
 * Schlüssels und ändert sich bei einer Rotation von selbst.
 */
export async function GET() {
  return discoveryResponse(await getMcpJwks());
}

export async function OPTIONS() {
  return discoveryPreflight();
}
