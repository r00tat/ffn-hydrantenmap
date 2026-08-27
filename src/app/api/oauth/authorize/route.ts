import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '../../../../server/auth/baseUrl';
import { resolveAuthorizeRequest } from '../../../../server/oauth/authorizeFlow';
import { callerKey, checkRateLimit } from '../../../../server/oauth/rateLimit';
import { oauthError } from '../../../../server/oauth/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Der Authorization Endpoint (RFC 6749 Abschnitt 4.1.1).
 *
 * Kein eigener Login: Ist niemand angemeldet, geht es über die bestehende
 * Anmeldeseite und mit `callbackUrl` zurück hierher. Fehlt die Einwilligung,
 * übernimmt der Consent-Bildschirm unter `/oauth/consent`.
 */

/**
 * Aufrufe je Adresse und Minute.
 *
 * Der Endpunkt löst bei einem CIMD-Client einen ausgehenden Abruf aus, dessen
 * Ziel der Aufrufer bestimmt. Ohne Anmeldung kommt es dazu nicht mehr (siehe
 * `resolveAuthorizeRequest`); dieses Limit deckt den angemeldeten Fall ab.
 *
 * 30 ist reichlich für einen Menschen: Ein Verbindungsaufbau kostet zwei
 * Aufrufe (hin und nach der Anmeldung zurück), und öfter als ein paar Mal am
 * Tag verbindet niemand eine Anwendung.
 */
const AUTHORIZE_RATE_LIMIT = 30;
const AUTHORIZE_RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const limit = checkRateLimit(
    callerKey(req.headers, 'oauth-authorize'),
    AUTHORIZE_RATE_LIMIT,
    AUTHORIZE_RATE_WINDOW_MS,
  );
  if (!limit.allowed) {
    return oauthError('invalid_request', 'too many requests', 429, {
      'retry-after': String(limit.retryAfter),
    });
  }

  const outcome = await resolveAuthorizeRequest(req.nextUrl.searchParams);

  // Die eigenen Ziele (Anmeldung, Consent, Fehlerseite) werden gegen die
  // öffentliche Basis-URL aufgelöst, nicht gegen `req.nextUrl.origin`: Hinter
  // Cloud Run steht dort die interne Container-Adresse (`https://0.0.0.0:8080`),
  // die Custom Domain kommt nur über die Forwarded-Header des Requests
  // (siehe `getBaseUrl`, `docs/auth-und-origins.md`). Eine Weiterleitung
  // dorthin ist für den Browser eine Sackgasse und bricht den ganzen Flow.
  //
  // Für `kind: 'redirect'` ist `outcome.url` die absolute, geprüfte
  // `redirect_uri` des Clients — die Basis bleibt dort ohne Wirkung.
  const baseUrl = await getBaseUrl();

  switch (outcome.kind) {
    case 'redirect':
    case 'login':
      return NextResponse.redirect(new URL(outcome.url, baseUrl), {
        status: 302,
        headers: { 'cache-control': 'no-store' },
      });
    case 'consent':
      return NextResponse.redirect(
        new URL(`/oauth/consent?${outcome.query}`, baseUrl),
        { status: 302, headers: { 'cache-control': 'no-store' } },
      );
    case 'error':
      // Ohne verifizierte `redirect_uri` darf nicht weitergeleitet werden —
      // sonst wäre der Endpunkt eine offene Weiterleitung. Der Fehler wird
      // dem angemeldeten Menschen angezeigt.
      return NextResponse.redirect(
        new URL(
          `/oauth/fehler?error=${encodeURIComponent(outcome.error)}&description=${encodeURIComponent(outcome.description)}`,
          baseUrl,
        ),
        { status: 302, headers: { 'cache-control': 'no-store' } },
      );
  }
}
