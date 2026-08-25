import 'server-only';

import { fetchClientIdMetadata, isCimdClientId } from './cimd';
import { hashToken, timingSafeCompare } from './secrets';
import { loadClient } from './store';
import type { OAuthClient } from './types';

export class ClientResolutionError extends Error {
  readonly code: 'invalid_client';
  constructor(message: string) {
    super(message);
    this.code = 'invalid_client';
  }
}

/**
 * Löst eine `client_id` auf — egal ob sie aus einer dynamischen Registrierung
 * stammt oder ein Client ID Metadata Document bezeichnet.
 *
 * Beide Wege werden unterstützt: DCR, weil claude.ai es heute nutzt, CIMD,
 * weil es DCR ablöst (Spec-Revision 2026-07-28). Welcher Weg vorliegt, steht
 * an der `client_id` selbst — eine HTTPS-URL ist immer CIMD.
 */
export async function resolveClient(
  clientId: string,
  issuer: string,
): Promise<OAuthClient> {
  if (isCimdClientId(clientId)) {
    try {
      return await fetchClientIdMetadata(clientId, issuer);
    } catch (err) {
      throw new ClientResolutionError(
        `client id metadata document could not be used: ${(err as Error).message}`,
      );
    }
  }

  const client = await loadClient(clientId);
  if (!client) {
    throw new ClientResolutionError(`client ${clientId} is not registered`);
  }

  // Spec-Revision 2026-07-28: Client-Credentials sind an den ausstellenden
  // Issuer gebunden. Ein auf dev registrierter Client gilt nicht auf prod —
  // sonst ließe sich eine Registrierung von einer Umgebung in die andere
  // tragen.
  if (client.issuer && client.issuer !== issuer) {
    throw new ClientResolutionError(
      `client ${clientId} was registered for a different issuer`,
    );
  }

  return client;
}

export interface ClientCredentials {
  clientId?: string;
  clientSecret?: string;
}

/**
 * Client-Authentisierung am Token- und Revoke-Endpunkt.
 *
 * Public Clients (`token_endpoint_auth_method: 'none'`) authentisieren sich
 * nicht — ihr Schutz ist PKCE, nicht ein Geheimnis, das im Browser oder in
 * einer Desktop-App ohnehin nicht zu halten wäre.
 */
export function verifyClientAuthentication(
  client: OAuthClient,
  credentials: ClientCredentials,
): void {
  if (client.token_endpoint_auth_method === 'none') {
    return;
  }
  if (!credentials.clientSecret) {
    throw new ClientResolutionError('client authentication is required');
  }
  if (!client.client_secret_hash) {
    throw new ClientResolutionError('client has no secret on file');
  }
  if (
    !timingSafeCompare(hashToken(credentials.clientSecret), client.client_secret_hash)
  ) {
    throw new ClientResolutionError('client authentication failed');
  }
}

/**
 * Liest `client_id`/`client_secret` aus Body und `Authorization`-Header.
 *
 * RFC 6749 Abschnitt 2.3.1 lässt beide Formen zu; der Header hat Vorrang,
 * damit ein Client nicht durch einen zusätzlichen Body-Parameter eine
 * schwächere Variante erzwingen kann.
 */
export function readClientCredentials(
  form: URLSearchParams,
  authorizationHeader: string | null,
): ClientCredentials {
  if (authorizationHeader?.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(
      authorizationHeader.slice(6).trim(),
      'base64',
    ).toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator > -1) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
      };
    }
  }
  return {
    clientId: form.get('client_id') ?? undefined,
    clientSecret: form.get('client_secret') ?? undefined,
  };
}
