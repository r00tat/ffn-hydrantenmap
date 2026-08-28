import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actionUserRequired = vi.fn(async () => ({ user: { id: 'u1' } }));
vi.mock('../auth', () => ({
  actionUserRequired: () => actionUserRequired(),
}));

const { loadWmsCapabilities } = await import('./mapCapabilities');

const capabilities = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Service><Title>Orthofoto</Title></Service>
  <Capability>
    <Request><GetMap><Format>image/png</Format></GetMap></Request>
    <Layer>
      <Title>root</Title>
      <Layer><Name>1</Name><Title>Orthofoto aktuell</Title></Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  });
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/** Eine Antwort, die endlos sendet — ohne `content-length`. */
function endlessResponse(): Response {
  const chunk = new Uint8Array(64 * 1024);
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk);
    },
  });
  return new Response(stream, { status: 200 });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  actionUserRequired.mockResolvedValue({ user: { id: 'u1' } });
});

describe('loadWmsCapabilities', () => {
  it('verlangt einen angemeldeten Benutzer', async () => {
    actionUserRequired.mockRejectedValueOnce(new Error('not authorized'));

    await expect(
      loadWmsCapabilities('https://gis.example.at/wms?')
    ).rejects.toThrow('not authorized');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('liest die Layer eines WMS', async () => {
    fetchMock.mockResolvedValue(xmlResponse(capabilities));

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.error).toBeUndefined();
    expect(result.title).toBe('Orthofoto');
    expect(result.layers.map((l) => l.name)).toEqual(['1']);
    expect(result.serviceUrl).toBe('https://gis.example.at/wms?');
  });

  it('fragt eine interne Adresse gar nicht erst an', async () => {
    for (const url of [
      'http://gis.example.at/wms',
      'https://169.254.169.254/latest/meta-data/',
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://127.0.0.1/wms',
      'https://intranet/wms',
    ]) {
      const result = await loadWmsCapabilities(url);
      expect(result.error, url).toBe('invalid-url');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('folgt keinem Umzug auf eine interne Adresse', async () => {
    // Der klassische SSRF-Umweg: ein harmloser öffentlicher Name antwortet mit
    // einer Weiterleitung ins interne Netz.
    fetchMock.mockResolvedValue(
      redirectTo('http://169.254.169.254/computeMetadata/v1/')
    );

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.error).toBe('unreachable');
    // Nur die beiden Erstaufrufe (1.3.0 und 1.1.1), kein Aufruf des Ziels.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toContain('gis.example.at');
    }
  });

  it('folgt einem Umzug auf eine öffentliche Adresse', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://neu.example.at/wms?'))
      .mockResolvedValueOnce(xmlResponse(capabilities));

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.layers.map((l) => l.name)).toEqual(['1']);
    expect(fetchMock.mock.calls[1][0]).toContain('neu.example.at');
  });

  it('bricht bei einer zu großen Antwort ab, statt sie zu puffern', async () => {
    fetchMock.mockImplementation(async () => endlessResponse());

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.error).toBe('unreachable');
  });

  it('verwirft eine Antwort, die schon per content-length zu groß ist', async () => {
    fetchMock.mockResolvedValue(
      new Response('<a/>', {
        status: 200,
        headers: { 'content-length': String(64 * 1024 * 1024) },
      })
    );

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.error).toBe('unreachable');
  });

  it('meldet einen Dienst ohne anforderbare Layer', async () => {
    fetchMock.mockResolvedValue(xmlResponse('<html><body>404</body></html>'));

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.error).toBe('no-layers');
  });

  it('meldet einen Dienst, der nicht antwortet', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));

    const result = await loadWmsCapabilities('https://gis.example.at/wms?');

    expect(result.error).toBe('unreachable');
  });
});
