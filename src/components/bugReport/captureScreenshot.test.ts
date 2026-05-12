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
      }),
    );
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
