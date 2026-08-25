import 'server-only';

import { coversScopes, type McpScope } from '../../common/mcp/scopes';
import { isFirecallGuest } from '../../common/firecallGuest';
import { auth } from '../../app/auth';
import { createAuthCode } from './authCodes';
import {
  buildAuthorizeRedirect,
  parseAuthorizeParams,
  validateAuthorizeRequest,
} from './authorizeRequest';
import { ClientResolutionError, resolveClient } from './clients';
import { getMcpResourceUrl, getOauthIssuer } from './issuer';
import {
  firestoreAuthCodeStore,
  loadConsent,
  saveConsent,
} from './store';
import type { OAuthClient } from './types';

/**
 * Der Ablauf hinter `/api/oauth/authorize` und dem Consent-Bildschirm.
 *
 * Beide durchlaufen dieselbe Prüfung: Der Consent-Bildschirm ist nur eine
 * Anzeige, die Entscheidung fällt auch beim Bestätigen noch einmal hier. Ein
 * manipulierter Formular-Post kann damit keine Parameter unterschieben, die
 * der `authorize`-Endpunkt abgelehnt hätte.
 */

export type AuthorizeOutcome =
  /** Weiterleitung zum Client — mit Code oder mit `error`. */
  | { kind: 'redirect'; url: string }
  /** Niemand angemeldet: über die bestehende Anmeldung zurückkommen. */
  | { kind: 'login'; url: string }
  /** Einwilligung fehlt: Bildschirm anzeigen. */
  | {
      kind: 'consent';
      client: OAuthClient;
      scopes: McpScope[];
      /** Die unveränderte Anfrage, die der Bildschirm zurückschickt. */
      query: string;
    }
  /** Nicht weiterleitbar — `client_id` oder `redirect_uri` sind unbrauchbar. */
  | { kind: 'error'; error: string; description: string };

export interface ResolveAuthorizeOptions {
  /**
   * Beim Bestätigen im Consent-Bildschirm gesetzt: die Einwilligung wird
   * gespeichert und der Code sofort ausgestellt.
   */
  grantConsent?: boolean;
}

export async function resolveAuthorizeRequest(
  searchParams: URLSearchParams,
  { grantConsent = false }: ResolveAuthorizeOptions = {},
): Promise<AuthorizeOutcome> {
  const issuer = await getOauthIssuer();
  const resource = await getMcpResourceUrl();
  const params = parseAuthorizeParams(searchParams);

  if (!params.clientId) {
    return {
      kind: 'error',
      error: 'invalid_request',
      description: 'client_id is required',
    };
  }

  let client: OAuthClient;
  try {
    client = await resolveClient(params.clientId, issuer);
  } catch (err) {
    return {
      kind: 'error',
      error: 'invalid_client',
      description:
        err instanceof ClientResolutionError
          ? err.message
          : 'client could not be resolved',
    };
  }

  const validation = validateAuthorizeRequest(params, client, { resource });
  if (validation.kind === 'fatal') {
    return {
      kind: 'error',
      error: validation.error,
      description: validation.description,
    };
  }
  if (validation.kind === 'redirect-error') {
    return {
      kind: 'redirect',
      url: buildAuthorizeRedirect(validation.redirectUri, issuer, {
        error: validation.error,
        error_description: validation.description,
        state: validation.state,
      }),
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    // Login-Delegation: Die Benutzer-Authentisierung bleibt bei der
    // bestehenden Anmeldung, dieser Server stellt nur Tokens aus. Es gibt
    // weiterhin genau eine Benutzerverwaltung.
    const callbackUrl = `/api/oauth/authorize?${searchParams.toString()}`;
    return {
      kind: 'login',
      url: `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    };
  }

  const deny = (description: string): AuthorizeOutcome => ({
    kind: 'redirect',
    url: buildAuthorizeRedirect(validation.redirectUri, issuer, {
      error: 'access_denied',
      error_description: description,
      state: validation.state,
    }),
  });

  if (!session.user.isAuthorized) {
    return deny('your user is not authorized for this application');
  }

  // Einsatz-Gäste sind vom MCP-Zugang ausgenommen (offene Frage 1 aus #730):
  // Ihr Zugang ist ein zeitlich begrenzter Share-Link auf genau einen Einsatz;
  // ihn über einen externen Client dauerhaft verlängerbar zu machen, wäre das
  // Gegenteil dessen, wofür er gedacht ist.
  if (isFirecallGuest({ firecall: session.user.firecall })) {
    return deny('firecall guests cannot connect external applications');
  }

  const existingConsent = await loadConsent(session.user.id, client.client_id);
  const alreadyConsented =
    existingConsent !== undefined &&
    coversScopes(existingConsent.scopes, validation.scopes);

  if (!alreadyConsented && !grantConsent) {
    return {
      kind: 'consent',
      client,
      scopes: validation.scopes,
      query: searchParams.toString(),
    };
  }

  if (!alreadyConsented) {
    const now = new Date().toISOString();
    await saveConsent({
      userId: session.user.id,
      clientId: client.client_id,
      clientName: client.client_name,
      // Vereinigung statt Ersetzen: Wer einem Client schon Leserechte gegeben
      // hat und jetzt Schreibrechte bestätigt, soll nicht beim nächsten
      // Verbinden erneut nach den Leserechten gefragt werden.
      scopes: mergeScopes(existingConsent?.scopes ?? [], validation.scopes),
      grantedAt: existingConsent?.grantedAt ?? now,
      updatedAt: now,
    });
  }

  const code = await createAuthCode({
    store: firestoreAuthCodeStore(),
    clientId: client.client_id,
    userId: session.user.id,
    redirectUri: validation.redirectUri,
    scopes: validation.scopes,
    codeChallenge: validation.codeChallenge,
    codeChallengeMethod: validation.codeChallengeMethod,
    resource: validation.resource,
  });

  console.info(
    `oauth authorize: code issued for ${client.client_id} / ${session.user.id} (${validation.scopes.join(' ')})`,
  );

  return {
    kind: 'redirect',
    url: buildAuthorizeRedirect(validation.redirectUri, issuer, {
      code,
      state: validation.state,
    }),
  };
}

function mergeScopes(a: McpScope[], b: McpScope[]): McpScope[] {
  return [...new Set([...a, ...b])];
}
