// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const domToBlobMock = vi.fn();
vi.mock('modern-screenshot', () => ({
  domToBlob: (...args: unknown[]) => domToBlobMock(...args),
}));

import { captureScreenshot, isScreenshotSupported } from './captureScreenshot';

describe('isScreenshotSupported', () => {
  it('returns true when document exists (jsdom)', () => {
    expect(isScreenshotSupported()).toBe(true);
  });
});

describe('captureScreenshot', () => {
  beforeEach(() => {
    domToBlobMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the PNG blob produced by modern-screenshot', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    domToBlobMock.mockResolvedValueOnce(blob);

    const result = await captureScreenshot();

    expect(result).toBe(blob);
    expect(domToBlobMock).toHaveBeenCalledTimes(1);
    expect(domToBlobMock).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        type: 'image/png',
        scale: expect.any(Number),
        backgroundColor: '#ffffff',
        font: false,
        filter: expect.any(Function),
        fetch: expect.objectContaining({
          placeholderImage: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      }),
    );
  });

  it('caps scale so the longest dimension stays <= 1280', async () => {
    domToBlobMock.mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }));
    // jsdom defaults to 0x0 dimensions which would set scale to 1; force
    // a wider body so the cap kicks in.
    Object.defineProperty(document.body, 'scrollWidth', {
      configurable: true,
      value: 2560,
    });
    Object.defineProperty(document.body, 'scrollHeight', {
      configurable: true,
      value: 1323,
    });

    await captureScreenshot();
    const opts = domToBlobMock.mock.calls[0][1];
    expect(opts.scale).toBeCloseTo(0.5, 2);
  });

  it('filters out googleusercontent avatars, scripts, and data-skip-screenshot nodes', async () => {
    domToBlobMock.mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }));
    await captureScreenshot();
    const filter = domToBlobMock.mock.calls[0][1].filter as (
      n: Node,
    ) => boolean;

    const avatarImg = document.createElement('img');
    avatarImg.src = 'https://lh3.googleusercontent.com/abc=s96';
    expect(filter(avatarImg)).toBe(false);

    const tileImg = document.createElement('img');
    tileImg.src = 'https://a.tile.openstreetmap.org/10/0/0.png';
    expect(filter(tileImg)).toBe(true);

    const skipped = document.createElement('div');
    skipped.dataset.skipScreenshot = 'true';
    expect(filter(skipped)).toBe(false);

    expect(filter(document.createElement('div'))).toBe(true);
    expect(filter(document.createElement('script'))).toBe(false);
    // <style> and <link> stay in so MUI/Emotion CSS-in-JS keeps working.
    expect(filter(document.createElement('style'))).toBe(true);
    expect(filter(document.createElement('link'))).toBe(true);
  });

  it('returns null and does not throw when modern-screenshot rejects', async () => {
    domToBlobMock.mockRejectedValueOnce(new Error('boom'));
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await captureScreenshot();
    expect(result).toBeNull();
    spy.mockRestore();
  });
});
