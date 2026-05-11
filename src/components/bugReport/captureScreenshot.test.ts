// @vitest-environment jsdom
// captureScreenshot.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureScreenshot, isScreenshotSupported } from './captureScreenshot';

describe('isScreenshotSupported', () => {
  it('returns true when getDisplayMedia exists', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getDisplayMedia: vi.fn() } },
    });
    expect(isScreenshotSupported()).toBe(true);
  });

  it('returns false when mediaDevices missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    expect(isScreenshotSupported()).toBe(false);
  });
});

describe('captureScreenshot', () => {
  let stopSpy: ReturnType<typeof vi.fn>;
  let track: { stop: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stopSpy = vi.fn();
    track = { stop: stopSpy };

    const stream = { getTracks: () => [track] } as unknown as MediaStream;

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
      },
    });

    // jsdom video / canvas stubs
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 320 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 240 });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/png' }));
    } as any;

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a PNG blob and stops the track', async () => {
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/png');
    expect(stopSpy).toHaveBeenCalled();
  });

  it('returns null and stops the track when user cancels', async () => {
    (navigator.mediaDevices.getDisplayMedia as any).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );
    const blob = await captureScreenshot();
    expect(blob).toBeNull();
  });
});
