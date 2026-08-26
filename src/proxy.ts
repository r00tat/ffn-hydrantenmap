import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';

// Extension ids allowed to call /api cross-origin. The Chrome extension needs
// this for /api/appcheck: its origin is chrome-extension://<id>, which the
// static Access-Control-Allow-Origin below does not cover. Relying on CORS
// instead of adding einsatz.ffnd.at to the extension's host_permissions avoids
// a new permission prompt, which would disable the extension for existing users
// until they re-approve it.
//
// The id is pinned by the manifest's `key` field, so unpacked dev builds and the
// Chrome Web Store release share it. CHROME_EXTENSION_IDS (comma separated) can
// add further ids without a code change.
const DEFAULT_EXTENSION_IDS = 'pmbpeglmifalphllnijipcolfgjhmlbn';

function allowedExtensionOrigins(): string[] {
  return (process.env.CHROME_EXTENSION_IDS || DEFAULT_EXTENSION_IDS)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => `chrome-extension://${id}`);
}

/**
 * Pfade, die ihre CORS-Header selbst setzen und deshalb hier unangetastet
 * bleiben müssen.
 *
 * Der Block unten setzt `Access-Control-Allow-Origin` auf die eigene Adresse
 * und beantwortet jeden OPTIONS-Aufruf selbst. Für die OAuth- und
 * MCP-Endpunkte ist beides falsch: Sie werden von fremden Origins aufgerufen
 * (claude.ai lädt die Discovery-Dokumente im Browser), brauchen `*` und im
 * Preflight ihre eigene Header-Liste — `authorization` und
 * `mcp-protocol-version` stehen unten nicht. Ohne diese Ausnahme scheitert der
 * Verbindungsaufbau, und zwar erst im Browser des Nutzers.
 */
const SELF_MANAGED_CORS_PREFIXES = ['/api/mcp', '/api/oauth/'];

export function proxy(req: NextRequest, ev: NextFetchEvent) {
  let res = NextResponse.next();

  const selfManaged = SELF_MANAGED_CORS_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix),
  );

  if (!selfManaged && req.nextUrl.pathname.startsWith('/api')) {
    // This logic is only applied to /api

    if (req.method == 'OPTIONS') {
      res = NextResponse.json({});
      res.headers.set(
        'Access-Control-Allow-Methods',
        'PUT, POST, PATCH, DELETE, GET'
      );
    }

    const origin = req.headers.get('origin');
    if (origin && allowedExtensionOrigins().includes(origin)) {
      // Echoing a single origin requires Vary, otherwise a shared cache could
      // hand this response to a different origin.
      res.headers.set('Access-Control-Allow-Origin', origin);
      res.headers.set('Vary', 'Origin');
    } else {
      res.headers.set(
        'Access-Control-Allow-Origin',
        process.env.NEXTAUTH_URL || 'https://einsatz.ffnd.at'
      );
    }

    res.headers.set(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
  }

  return res;
}
