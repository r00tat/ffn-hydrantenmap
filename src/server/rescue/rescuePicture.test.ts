import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { fetchRescuePicture, sniffImageType } = await import('./rescuePicture');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function imageResponse(bytes: Uint8Array, headers: HeadersInit = {}): Response {
  return new Response(bytes as unknown as BodyInit, { status: 200, headers });
}

describe('sniffImageType', () => {
  it('erkennt die gängigen Bildformate an den ersten Bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(GIF)).toBe('image/gif');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('erkennt ein echtes PDF nicht als Bild', () => {
    expect(sniffImageType(PDF)).toBeUndefined();
  });

  it('kommt mit einer leeren Antwort zurecht', () => {
    expect(sniffImageType(new Uint8Array())).toBeUndefined();
  });
});

describe('fetchRescuePicture', () => {
  it('weist den falschen Content-Type von Euro NCAP zurecht', async () => {
    // Der Kern des Fehlers: die Bytes sind ein PNG, der Header behauptet PDF.
    fetchMock.mockResolvedValue(
      imageResponse(PNG, { 'content-type': 'application/pdf' }),
    );

    const picture = await fetchRescuePicture('https://api.example.test/a.png');

    expect(picture?.contentType).toBe('image/png');
    expect(picture?.body).toEqual(PNG);
  });

  it('verwirft eine Antwort, die wirklich kein Bild ist', async () => {
    fetchMock.mockResolvedValue(
      imageResponse(PDF, { 'content-type': 'image/png' }),
    );

    expect(
      await fetchRescuePicture('https://api.example.test/a.png'),
    ).toBeUndefined();
  });

  it('verwirft einen Fehlerstatus', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));

    expect(
      await fetchRescuePicture('https://api.example.test/a.png'),
    ).toBeUndefined();
  });

  it('bricht bei einer endlosen Antwort ab, statt sie zu puffern', async () => {
    // Ohne content-length greift die Vorabprüfung nicht. Die Grenze muss
    // deshalb beim Lesen ziehen — sonst begrenzt sie nichts.
    const chunk = new Uint8Array(64 * 1024);
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(chunk);
          },
        }),
        { status: 200 },
      ),
    );

    expect(
      await fetchRescuePicture('https://api.example.test/a.png'),
    ).toBeUndefined();
  });

  it('verwirft eine Antwort, die per content-length zu groß ist', async () => {
    fetchMock.mockResolvedValue(
      imageResponse(PNG, { 'content-length': String(64 * 1024 * 1024) }),
    );

    expect(
      await fetchRescuePicture('https://api.example.test/a.png'),
    ).toBeUndefined();
  });
});
