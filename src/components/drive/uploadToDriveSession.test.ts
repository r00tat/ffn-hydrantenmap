import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadToDriveSession } from './uploadToDriveSession';

class FakeXhr {
  static last: FakeXhr;
  status = 200;
  upload = { onprogress: undefined as ((e: any) => void) | undefined };
  onload?: () => void;
  onerror?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  constructor() {
    FakeXhr.last = this;
  }
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
});

const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });

describe('uploadToDriveSession', () => {
  it('resolves on a 2xx response', async () => {
    const promise = uploadToDriveSession('https://upload/x', file);
    FakeXhr.last.onload!();
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on an error status', async () => {
    const promise = uploadToDriveSession('https://upload/x', file);
    FakeXhr.last.status = 403;
    FakeXhr.last.onload!();
    await expect(promise).rejects.toThrow('403');
  });

  it('rejects on a network or CORS error', async () => {
    const promise = uploadToDriveSession('https://upload/x', file);
    FakeXhr.last.onerror!();
    await expect(promise).rejects.toThrow(/CORS/);
  });

  it('reports progress', async () => {
    const onProgress = vi.fn();
    const promise = uploadToDriveSession('https://upload/x', file, onProgress);
    FakeXhr.last.upload.onprogress!({
      lengthComputable: true,
      loaded: 5,
      total: 10,
    });
    FakeXhr.last.onload!();
    await promise;
    expect(onProgress).toHaveBeenCalledWith(5, 10);
  });
});
