import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizeRequest } from '../../../../server/oauth/authorizeFlow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Der Authorization Endpoint (RFC 6749 Abschnitt 4.1.1).
 *
 * Kein eigener Login: Ist niemand angemeldet, geht es über die bestehende
 * Anmeldeseite und mit `callbackUrl` zurück hierher. Fehlt die Einwilligung,
 * übernimmt der Consent-Bildschirm unter `/oauth/consent`.
 */
export async function GET(req: NextRequest) {
  const outcome = await resolveAuthorizeRequest(req.nextUrl.searchParams);

  switch (outcome.kind) {
    case 'redirect':
    case 'login':
      return NextResponse.redirect(new URL(outcome.url, req.nextUrl.origin), {
        status: 302,
        headers: { 'cache-control': 'no-store' },
      });
    case 'consent':
      return NextResponse.redirect(
        new URL(`/oauth/consent?${outcome.query}`, req.nextUrl.origin),
        { status: 302, headers: { 'cache-control': 'no-store' } },
      );
    case 'error':
      // Ohne verifizierte `redirect_uri` darf nicht weitergeleitet werden —
      // sonst wäre der Endpunkt eine offene Weiterleitung. Der Fehler wird
      // dem angemeldeten Menschen angezeigt.
      return NextResponse.redirect(
        new URL(
          `/oauth/fehler?error=${encodeURIComponent(outcome.error)}&description=${encodeURIComponent(outcome.description)}`,
          req.nextUrl.origin,
        ),
        { status: 302, headers: { 'cache-control': 'no-store' } },
      );
  }
}
