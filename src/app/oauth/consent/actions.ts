'use server';
import 'server-only';

import { resolveAuthorizeRequest } from '../../../server/oauth/authorizeFlow';
import { buildAuthorizeRedirect } from '../../../server/oauth/authorizeRequest';
import { getOauthIssuer } from '../../../server/oauth/issuer';
import { parseAuthorizeParams } from '../../../server/oauth/authorizeRequest';
import { resolveClient } from '../../../server/oauth/clients';
import { matchRedirectUri } from '../../../server/oauth/redirectUri';
import { actionUserRequired } from '../../auth';

export interface ConsentDecisionResult {
  /** Wohin der Browser als Nächstes gehen soll. */
  redirectUrl: string;
}

/**
 * Bestätigung im Consent-Bildschirm.
 *
 * Die gesamte Prüfung läuft hier noch einmal (`resolveAuthorizeRequest` mit
 * `grantConsent`): Der Bildschirm ist nur eine Anzeige, entschieden wird
 * serverseitig. Ein manipuliertes Formular kann damit keine Parameter
 * unterschieben, die der `authorize`-Endpunkt abgelehnt hätte.
 */
export async function approveOauthConsent(
  query: string,
): Promise<ConsentDecisionResult> {
  await actionUserRequired();

  const outcome = await resolveAuthorizeRequest(new URLSearchParams(query), {
    grantConsent: true,
  });

  switch (outcome.kind) {
    case 'redirect':
    case 'login':
      return { redirectUrl: outcome.url };
    case 'consent':
      // Kann nur passieren, wenn zwischen Anzeige und Bestätigung etwas
      // weggebrochen ist — dann noch einmal von vorn.
      return { redirectUrl: `/api/oauth/authorize?${outcome.query}` };
    case 'error':
      return {
        redirectUrl: `/oauth/fehler?error=${encodeURIComponent(outcome.error)}&description=${encodeURIComponent(outcome.description)}`,
      };
  }
}

/**
 * Ablehnung im Consent-Bildschirm.
 *
 * Nach RFC 6749 Abschnitt 4.1.2.1 geht `access_denied` an den Client zurück —
 * ohne diese Rückmeldung bliebe der Client hängen, statt es dem Benutzer zu
 * sagen.
 */
export async function denyOauthConsent(
  query: string,
): Promise<ConsentDecisionResult> {
  await actionUserRequired();

  const params = parseAuthorizeParams(new URLSearchParams(query));
  const issuer = await getOauthIssuer();

  if (!params.clientId || !params.redirectUri) {
    return { redirectUrl: '/' };
  }

  try {
    const client = await resolveClient(params.clientId, issuer);
    const redirectUri = matchRedirectUri(
      params.redirectUri,
      client.redirect_uris,
    );
    if (!redirectUri) {
      return { redirectUrl: '/' };
    }
    return {
      redirectUrl: buildAuthorizeRedirect(redirectUri, issuer, {
        error: 'access_denied',
        error_description: 'the user denied the request',
        state: params.state,
      }),
    };
  } catch {
    // Ein unbekannter Client bekommt keine Weiterleitung — dieselbe Regel wie
    // bei den fatalen Fehlern im `authorize`-Endpunkt.
    return { redirectUrl: '/' };
  }
}
