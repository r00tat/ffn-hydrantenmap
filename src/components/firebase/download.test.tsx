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

async function loadModule() {
  vi.resetModules();
  return await import('./download');
}

beforeEach(() => {
  isNativePlatformMock.mockReset();
  writeFileMock.mockReset();
  shareMock.mockReset();
  writeFileMock.mockResolvedValue({ uri: 'file:///cache/test.txt' });
  shareMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadBlob — web', () => {
  it('creates an <a download> and clicks it when not on a native platform', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const { downloadBlob } = await loadModule();

    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const blob = new Blob(['hello'], { type: 'text/plain' });
    await downloadBlob(blob, 'hello.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(shareMock).not.toHaveBeenCalled();
  });
});

describe('downloadBlob — native (Capacitor)', () => {
  it('writes to Filesystem cache and opens the Share sheet', async () => {
    isNativePlatformMock.mockReturnValue(true);
    const { downloadBlob } = await loadModule();

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const blob = new Blob(['hello native'], { type: 'text/plain' });
    await downloadBlob(blob, 'native.txt');

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const writeArgs = writeFileMock.mock.calls[0][0] as {
      path: string;
      data: string;
      directory: string;
    };
    expect(writeArgs.path).toBe('native.txt');
    expect(writeArgs.directory).toBe('CACHE');
    // base64 of "hello native"
    expect(writeArgs.data).toBe(
      Buffer.from('hello native', 'utf-8').toString('base64'),
    );

    expect(shareMock).toHaveBeenCalledTimes(1);
    const shareArgs = shareMock.mock.calls[0][0] as {
      url: string;
      title: string;
      dialogTitle: string;
    };
    expect(shareArgs.url).toBe('file:///cache/test.txt');
    expect(shareArgs.title).toBe('native.txt');

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('falls back to web flow if the Share sheet is cancelled', async () => {
    isNativePlatformMock.mockReturnValue(true);
    shareMock.mockRejectedValueOnce(new Error('Share canceled'));
    const { downloadBlob } = await loadModule();

    const blob = new Blob(['payload'], { type: 'text/plain' });
    // The cancellation must not throw up to the caller — downloads are fire-and-forget
    // from UI click handlers and should degrade gracefully.
    await expect(downloadBlob(blob, 'cancelled.txt')).resolves.not.toThrow();
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });

  it('sanitises filenames with path separators before writing', async () => {
    isNativePlatformMock.mockReturnValue(true);
    const { downloadBlob } = await loadModule();

    await downloadBlob(new Blob(['x']), 'sub/dir/../evil.txt');

    const writeArgs = writeFileMock.mock.calls[0][0] as { path: string };
    expect(writeArgs.path).not.toContain('/');
    expect(writeArgs.path).not.toContain('..');
  });
});
