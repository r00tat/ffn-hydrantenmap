import { describe, it, expect, afterEach } from 'vitest';
import { proxy } from './proxy';

const EXTENSION_ID = 'pmbpeglmifalphllnijipcolfgjhmlbn';

function makeReq(
  pathname: string,
  { method = 'GET', origin }: { method?: string; origin?: string } = {}
) {
  return {
    nextUrl: { pathname },
    method,
    headers: new Headers(origin ? { origin } : {}),
  } as any;
}

const ev = {} as any;

describe('proxy CORS handling', () => {
  const original = process.env.CHROME_EXTENSION_IDS;

  afterEach(() => {
    if (original === undefined) delete process.env.CHROME_EXTENSION_IDS;
    else process.env.CHROME_EXTENSION_IDS = original;
  });

  it('leaves non-api requests untouched', () => {
    const res = proxy(makeReq('/map'), ev);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows the published extension origin on api requests', () => {
    const res = proxy(
      makeReq('/api/appcheck', {
        method: 'POST',
        origin: `chrome-extension://${EXTENSION_ID}`,
      }),
      ev
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      `chrome-extension://${EXTENSION_ID}`
    );
  });

  it('marks the response as origin dependent so it is not cached across origins', () => {
    const res = proxy(
      makeReq('/api/appcheck', {
        method: 'POST',
        origin: `chrome-extension://${EXTENSION_ID}`,
      }),
      ev
    );

    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('answers the preflight for the extension origin', () => {
    const res = proxy(
      makeReq('/api/appcheck', {
        method: 'OPTIONS',
        origin: `chrome-extension://${EXTENSION_ID}`,
      }),
      ev
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      `chrome-extension://${EXTENSION_ID}`
    );
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain(
      'Authorization'
    );
  });

  it('rejects an unknown extension id', () => {
    const res = proxy(
      makeReq('/api/appcheck', {
        method: 'POST',
        origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
      ev
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).not.toContain(
      'chrome-extension'
    );
  });

  it('honours additional ids from CHROME_EXTENSION_IDS', () => {
    process.env.CHROME_EXTENSION_IDS = `${EXTENSION_ID}, localdevextensionidaaaaaaaaaaaaaa`;

    const res = proxy(
      makeReq('/api/appcheck', {
        method: 'POST',
        origin: 'chrome-extension://localdevextensionidaaaaaaaaaaaaaa',
      }),
      ev
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://localdevextensionidaaaaaaaaaaaaaa'
    );
  });

  it('keeps the web app origin for regular api requests', () => {
    const res = proxy(makeReq('/api/hydranten'), ev);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      process.env.NEXTAUTH_URL || 'https://einsatz.ffnd.at'
    );
  });
});

describe('MCP- und OAuth-Endpunkte', () => {
  // Diese Endpunkte setzen ihre CORS-Header selbst: Sie werden von fremden
  // Origins aufgerufen und brauchen `*` sowie im Preflight `authorization` und
  // `mcp-protocol-version`. Der Block oben überschriebe beides.
  it('bekommt keine Access-Control-Allow-Origin vom Proxy', () => {
    for (const path of ['/api/mcp', '/api/oauth/token', '/api/oauth/authorize']) {
      const res = proxy(makeReq(path, { method: 'POST' }), ev);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });

  it('beantwortet den Preflight nicht selbst', () => {
    const res = proxy(makeReq('/api/mcp', { method: 'OPTIONS' }), ev);

    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
  });

  it('lässt die übrigen API-Routen unverändert', () => {
    const res = proxy(makeReq('/api/hydranten'), ev);

    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
  });
});
