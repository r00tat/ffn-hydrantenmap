import { NextResponse } from 'next/server';

/**
 * Antworten der OAuth-Endpunkte.
 *
 * Discovery-Dokumente werden von Clients aus fremden Origins geholt (claude.ai
 * lädt sie im Browser). Sie brauchen deshalb offene CORS-Header — sie
 * enthalten nichts Vertrauliches. Der MCP-Endpunkt selbst bekommt sie nicht:
 * dort trägt jeder Aufruf ein Token.
 */
export function discoveryResponse(body: unknown): NextResponse {
  return NextResponse.json(body, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type, mcp-protocol-version',
      // Fünf Minuten: lange genug, damit ein Client nicht bei jedem Aufruf
      // neu lädt, kurz genug, dass ein Deploy mit geändertem Issuer nicht
      // stundenlang nachwirkt.
      'cache-control': 'public, max-age=300',
    },
  });
}

export function discoveryPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type, mcp-protocol-version',
      'access-control-max-age': '86400',
    },
  });
}

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata'
  | 'invalid_software_statement'
  | 'invalid_token'
  | 'insufficient_scope'
  /** RFC 8707 Abschnitt 2: die verlangte `resource` bedient dieser Server nicht. */
  | 'invalid_target';

/** Eine OAuth-Fehlerantwort nach RFC 6749 Abschnitt 5.2. */
export function oauthError(
  code: OAuthErrorCode,
  description: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: code, error_description: description },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
        'access-control-allow-origin': '*',
        ...extraHeaders,
      },
    },
  );
}

/** Erfolgsantwort des Token-Endpunkts — nie zwischenspeichern. */
export function tokenResponse(body: unknown): NextResponse {
  return NextResponse.json(body, {
    headers: {
      'cache-control': 'no-store',
      pragma: 'no-cache',
      'access-control-allow-origin': '*',
    },
  });
}
