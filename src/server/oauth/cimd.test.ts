import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertUsableCimdUrl,
  CimdError,
  fetchClientIdMetadata,
  isCimdClientId,
  resetCimdCache,
} from './cimd';

const CLIENT_ID = 'https://claude.ai/mcp/client';
const ISSUER = 'https://karte.example';

function jsonResponse(body: unknown, status = 200) {
  return { status, body: JSON.stringify(body) };
}

const validDocument = {
  client_id: CLIENT_ID,
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
};

function deps(overrides: Partial<Parameters<typeof fetchClientIdMetadata>[2]> = {}) {
  return {
    resolveHost: vi.fn(async () => ['104.18.0.1']),
    requestDocument: vi.fn(async () => jsonResponse(validDocument)),
    ...overrides,
  };
}

beforeEach(() => {
  resetCimdCache();
});

describe('isCimdClientId', () => {
  it('erkennt HTTPS-URLs als CIMD', () => {
    expect(isCimdClientId(CLIENT_ID)).toBe(true);
    expect(isCimdClientId('mcp_abc123')).toBe(false);
  });
});

describe('assertUsableCimdUrl', () => {
  it('nimmt eine gewöhnliche HTTPS-URL', () => {
    expect(assertUsableCimdUrl(CLIENT_ID).hostname).toBe('claude.ai');
  });

  it('weist http ab', () => {
    expect(() => assertUsableCimdUrl('http://claude.ai/c')).toThrow(/https/);
  });

  it('weist Zugangsdaten in der URL ab', () => {
    expect(() => assertUsableCimdUrl('https://u:p@claude.ai/c')).toThrow(
      /credentials/,
    );
  });

  it('weist ein Fragment ab', () => {
    expect(() => assertUsableCimdUrl('https://claude.ai/c#x')).toThrow(
      /fragment/,
    );
  });

  it('weist einen abweichenden Port ab', () => {
    expect(() => assertUsableCimdUrl('https://claude.ai:8443/c')).toThrow(
      /default https port/,
    );
  });

  it('weist localhost und interne Namen ab', () => {
    expect(() => assertUsableCimdUrl('https://localhost/c')).toThrow(
      /not an allowed CIMD host/,
    );
    expect(() =>
      assertUsableCimdUrl('https://metadata.google.internal/c'),
    ).toThrow(/not an allowed CIMD host/);
  });

  it('weist eine gesperrte IP als Host ab', () => {
    expect(() => assertUsableCimdUrl('https://169.254.169.254/c')).toThrow(
      /not an allowed CIMD host/,
    );
  });
});

describe('fetchClientIdMetadata', () => {
  it('reicht die Auflösung an den Abruf durch, damit die Verbindung gebunden ist', async () => {
    // Die maßgebliche Prüfung sitzt in der `lookup`-Funktion der Verbindung;
    // ohne dieselbe Auflösung wäre sie wirkungslos.
    const d = deps();
    await fetchClientIdMetadata(CLIENT_ID, ISSUER, d);
    expect(d.resolveHost).toHaveBeenCalledWith('claude.ai');
  });

  it('liefert den geprüften Client', async () => {
    const d = deps();
    const client = await fetchClientIdMetadata(CLIENT_ID, ISSUER, d);
    expect(client).toMatchObject({
      client_id: CLIENT_ID,
      client_name: 'Claude',
      source: 'cimd',
      issuer: ISSUER,
      token_endpoint_auth_method: 'none',
    });
  });

  it('weist einen Host ab, der auf eine private Adresse zeigt', async () => {
    const d = deps({ resolveHost: vi.fn(async () => ['127.0.0.1']) });
    await expect(
      fetchClientIdMetadata(CLIENT_ID, ISSUER, d),
    ).rejects.toThrow(/blocked address/);
    expect(d.requestDocument).not.toHaveBeenCalled();
  });

  it('weist ab, wenn nur eine von mehreren Adressen privat ist', async () => {
    const d = deps({
      resolveHost: vi.fn(async () => ['104.18.0.1', '169.254.169.254']),
    });
    await expect(
      fetchClientIdMetadata(CLIENT_ID, ISSUER, d),
    ).rejects.toThrow(/blocked address/);
  });

  it('weist ab, wenn client_id im Dokument nicht der URL entspricht', async () => {
    const d = deps({
      requestDocument: vi.fn(async () =>
        jsonResponse({ ...validDocument, client_id: 'https://evil.example/c' }),
      ),
    });
    await expect(fetchClientIdMetadata(CLIENT_ID, ISSUER, d)).rejects.toThrow(
      /does not match its URL/,
    );
  });

  it('weist einen Fehlerstatus ab', async () => {
    const d = deps({
      requestDocument: vi.fn(async () => ({ status: 404, body: 'nope' })),
    });
    await expect(fetchClientIdMetadata(CLIENT_ID, ISSUER, d)).rejects.toThrow(
      /responded with 404/,
    );
  });

  it('weist ein zu großes Dokument ab', async () => {
    const d = deps({
      requestDocument: vi.fn(async () => ({
        status: 200,
        body: 'x'.repeat(70 * 1024),
      })),
    });
    await expect(fetchClientIdMetadata(CLIENT_ID, ISSUER, d)).rejects.toThrow(
      /too large/,
    );
  });

  it('weist ungültiges JSON ab', async () => {
    const d = deps({
      requestDocument: vi.fn(async () => ({ status: 200, body: '{' })),
    });
    await expect(fetchClientIdMetadata(CLIENT_ID, ISSUER, d)).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('weist ungültige Metadaten ab', async () => {
    const d = deps({
      requestDocument: vi.fn(async () =>
        jsonResponse({ client_id: CLIENT_ID, redirect_uris: [] }),
      ),
    });
    await expect(fetchClientIdMetadata(CLIENT_ID, ISSUER, d)).rejects.toThrow(
      CimdError,
    );
  });

  it('weist einen CIMD-Client mit Client-Authentisierung ab', async () => {
    const d = deps({
      requestDocument: vi.fn(async () =>
        jsonResponse({
          ...validDocument,
          token_endpoint_auth_method: 'client_secret_post',
        }),
      ),
    });
    await expect(fetchClientIdMetadata(CLIENT_ID, ISSUER, d)).rejects.toThrow(
      /public client/,
    );
  });

  it('beantwortet den zweiten Aufruf aus dem Cache', async () => {
    const d = deps();
    await fetchClientIdMetadata(CLIENT_ID, ISSUER, d);
    await fetchClientIdMetadata(CLIENT_ID, ISSUER, d);
    expect(d.requestDocument).toHaveBeenCalledTimes(1);
  });

  it('holt nach Ablauf der Cache-Frist neu', async () => {
    let now = 1_000_000;
    const d = deps({ now: () => now });
    await fetchClientIdMetadata(CLIENT_ID, ISSUER, d);
    now += 16 * 60 * 1000;
    await fetchClientIdMetadata(CLIENT_ID, ISSUER, d);
    expect(d.requestDocument).toHaveBeenCalledTimes(2);
  });
});
