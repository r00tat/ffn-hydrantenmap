import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const authMock = vi.fn();
vi.mock('../../../../auth', () => ({ auth: () => authMock() }));

const loadRescueCatalogMock = vi.fn();
vi.mock('../../../../../server/rescue/euroRescueCatalog', () => ({
  loadRescueCatalog: () => loadRescueCatalogMock(),
}));

const fetchRescuePictureMock = vi.fn();
vi.mock('../../../../../server/rescue/rescuePicture', () => ({
  fetchRescuePicture: (url: string) => fetchRescuePictureMock(url),
}));

const { GET } = await import('./route');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);

function call(variantId: string) {
  return GET({} as never, { params: Promise.resolve({ variantId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { isAuthorized: true } });
  loadRescueCatalogMock.mockResolvedValue([
    { id: 'v1', pictureUrl: 'https://api.example.test/a.png' },
    { id: 'v2' },
  ]);
  fetchRescuePictureMock.mockResolvedValue({
    body: PNG,
    contentType: 'image/png',
  });
});

describe('GET /api/rettungskarten/bild/[variantId]', () => {
  it('liefert das Bild mit dem richtigen Content-Type', async () => {
    const response = await call('v1');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('holt die Adresse aus dem Katalog, nicht aus dem Request', async () => {
    // Damit ist die Route kein offener Proxy: eine fremde URL lässt sich
    // gar nicht erst hineinreichen.
    await call('v1');
    expect(fetchRescuePictureMock).toHaveBeenCalledWith(
      'https://api.example.test/a.png',
    );
  });

  it('weist einen nicht angemeldeten Aufrufer ab', async () => {
    authMock.mockResolvedValue(null);

    const response = await call('v1');

    expect(response.status).toBe(401);
    expect(fetchRescuePictureMock).not.toHaveBeenCalled();
  });

  it('weist einen angemeldeten, aber nicht freigeschalteten Benutzer ab', async () => {
    authMock.mockResolvedValue({ user: { isAuthorized: false } });

    expect((await call('v1')).status).toBe(401);
  });

  it('antwortet mit 404 für eine unbekannte Variante', async () => {
    expect((await call('gibtsnicht')).status).toBe(404);
    expect(fetchRescuePictureMock).not.toHaveBeenCalled();
  });

  it('antwortet mit 404 für eine Variante ohne Bild', async () => {
    expect((await call('v2')).status).toBe(404);
  });

  it('antwortet mit 404, wenn die Antwort kein Bild ist', async () => {
    fetchRescuePictureMock.mockResolvedValue(undefined);

    expect((await call('v1')).status).toBe(404);
  });

  it('antwortet mit 502, wenn der Katalog nicht erreichbar ist', async () => {
    loadRescueCatalogMock.mockRejectedValue(new Error('upstream'));

    expect((await call('v1')).status).toBe(502);
  });

  it('antwortet mit 502, wenn der Bildabruf scheitert', async () => {
    fetchRescuePictureMock.mockRejectedValue(new Error('ETIMEDOUT'));

    expect((await call('v1')).status).toBe(502);
  });
});
