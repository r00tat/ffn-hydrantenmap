// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toBlobMock = vi.fn();
vi.mock('html-to-image', () => ({
  toBlob: (...args: unknown[]) => toBlobMock(...args),
}));

import { captureScreenshot, isScreenshotSupported } from './captureScreenshot';

describe('isScreenshotSupported', () => {
  it('returns true when document exists (jsdom)', () => {
    expect(isScreenshotSupported()).toBe(true);
  });
});

describe('captureScreenshot', () => {
  beforeEach(() => {
    toBlobMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the PNG blob produced by html-to-image', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    toBlobMock.mockResolvedValueOnce(blob);

    const result = await captureScreenshot();

    expect(result).toBe(blob);
    expect(toBlobMock).toHaveBeenCalledTimes(1);
    expect(toBlobMock).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({
        cacheBust: true,
        backgroundColor: '#ffffff',
        skipFonts: true,
        filter: expect.any(Function),
        imagePlaceholder: expect.stringMatching(/^data:image\/png;base64,/),
      }),
    );
  });

  it('filters out googleusercontent avatars and data-skip-screenshot nodes', async () => {
    toBlobMock.mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }));
    await captureScreenshot();
    const filter = toBlobMock.mock.calls[0][1].filter as (n: Node) => boolean;

    const avatarImg = document.createElement('img');
    avatarImg.src = 'https://lh3.googleusercontent.com/abc=s96';
    expect(filter(avatarImg)).toBe(false);

    const tileImg = document.createElement('img');
    tileImg.src = 'https://a.tile.openstreetmap.org/10/0/0.png';
    expect(filter(tileImg)).toBe(true);

    const skipped = document.createElement('div');
    skipped.dataset.skipScreenshot = 'true';
    expect(filter(skipped)).toBe(false);

    const ordinaryDiv = document.createElement('div');
    expect(filter(ordinaryDiv)).toBe(true);
  });

  it('returns null when html-to-image fails to produce a blob', async () => {
    toBlobMock.mockResolvedValueOnce(null);
    const result = await captureScreenshot();
    expect(result).toBeNull();
  });

  it('returns null and does not throw when html-to-image rejects', async () => {
    toBlobMock.mockRejectedValueOnce(new Error('SecurityError'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await captureScreenshot();
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});
