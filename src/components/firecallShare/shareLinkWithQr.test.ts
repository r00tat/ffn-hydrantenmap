// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatformMock = vi.fn();
const writeFileMock = vi.fn();
const shareMock = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatformMock(),
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (opts: unknown) => writeFileMock(opts),
  },
  Directory: { Cache: 'CACHE' },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: (opts: unknown) => shareMock(opts),
  },
}));

const { shareLinkWithQr, firecallQrFilename } = await import(
  './shareLinkWithQr'
);

const URL_ = 'https://karte.example.at/einsatz/fc1?token=jwt';

function options() {
  return {
    url: URL_,
    title: 'Einsatz teilen',
    text: 'Zugang zum Einsatz Brand Hauptstraße',
    qrPng: new Blob(['png'], { type: 'image/png' }),
    filename: 'einsatz-link-orf.png',
  };
}

beforeEach(() => {
  isNativePlatformMock.mockReset().mockReturnValue(false);
  writeFileMock.mockReset().mockResolvedValue({ uri: 'file:///cache/qr.png' });
  shareMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('firecallQrFilename', () => {
  it('names the file after the guest', () => {
    expect(firecallQrFilename('Nachbarwehr Weiden')).toBe(
      'einsatz-link-nachbarwehr-weiden.png',
    );
  });

  it('falls back to a generic name without a usable guest name', () => {
    expect(firecallQrFilename('ÄÖÜ')).toBe('einsatz-link.png');
    expect(firecallQrFilename(undefined)).toBe('einsatz-link.png');
  });
});

describe('shareLinkWithQr — native', () => {
  it('shares the QR image together with the link in the text', async () => {
    isNativePlatformMock.mockReturnValue(true);

    await expect(shareLinkWithQr(options())).resolves.toBe('shared');

    expect(writeFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'einsatz-link-orf.png',
        directory: 'CACHE',
      }),
    );
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Einsatz teilen',
        text: `Zugang zum Einsatz Brand Hauptstraße\n${URL_}`,
        files: ['file:///cache/qr.png'],
      }),
    );
  });

  it('treats a dismissed share sheet as cancelled', async () => {
    isNativePlatformMock.mockReturnValue(true);
    shareMock.mockRejectedValue(new Error('Share canceled'));

    await expect(shareLinkWithQr(options())).resolves.toBe('cancelled');
  });
});

describe('shareLinkWithQr — web', () => {
  it('shares the QR image as file when the browser supports it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share,
      canShare: () => true,
    });

    await expect(shareLinkWithQr(options())).resolves.toBe('shared');

    const data = share.mock.lastCall![0] as ShareData;
    expect(data.text).toBe(`Zugang zum Einsatz Brand Hauptstraße\n${URL_}`);
    expect(data.files).toHaveLength(1);
    expect(data.files![0].name).toBe('einsatz-link-orf.png');
    expect(data.files![0].type).toBe('image/png');
  });

  it('shares only the link when files cannot be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share,
      canShare: () => false,
    });

    await expect(shareLinkWithQr(options())).resolves.toBe('shared');

    expect(share).toHaveBeenCalledWith({
      title: 'Einsatz teilen',
      text: 'Zugang zum Einsatz Brand Hauptstraße',
      url: URL_,
    });
  });

  it('reports an aborted share as cancelled', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true });

    await expect(shareLinkWithQr(options())).resolves.toBe('cancelled');
  });

  it('reports unsupported when the browser has no share sheet', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined });

    await expect(shareLinkWithQr(options())).resolves.toBe('unsupported');
  });

  it('passes on real share errors', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true });

    await expect(shareLinkWithQr(options())).rejects.toThrow('denied');
  });
});
