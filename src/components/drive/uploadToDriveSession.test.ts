import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadToDriveSession } from './uploadToDriveSession';

interface ScriptedResponse {
  status: number;
  /** Wert des `Range`-Headers einer 308-Antwort. */
  range?: string;
  responseText?: string;
  /** Netz- oder CORS-Fehler statt einer Antwort. */
  networkError?: boolean;
  /** Fortschritt, der vor der Antwort gemeldet wird. */
  progress?: { loaded: number; total: number };
}

class FakeXhr {
  static instances: FakeXhr[] = [];
  static script: ScriptedResponse[] = [];
  status = 0;
  responseText = '';
  headers: Record<string, string> = {};
  method = '';
  body: unknown;
  upload = { onprogress: undefined as ((e: any) => void) | undefined };
  onload?: () => void;
  onerror?: () => void;
  private range?: string;
  open = vi.fn((method: string) => {
    this.method = method;
  });
  setRequestHeader = vi.fn((name: string, value: string) => {
    this.headers[name] = value;
  });
  getResponseHeader = vi.fn((name: string) =>
    name.toLowerCase() === 'range' ? (this.range ?? null) : null,
  );
  send = vi.fn((body?: unknown) => {
    this.body = body;
    const next = FakeXhr.script.shift() ?? { status: 200 };
    queueMicrotask(() => {
      if (next.progress) {
        this.upload.onprogress?.({ lengthComputable: true, ...next.progress });
      }
      if (next.networkError) {
        this.onerror?.();
        return;
      }
      this.status = next.status;
      this.range = next.range;
      this.responseText = next.responseText ?? '';
      this.onload?.();
    });
  });
  constructor() {
    FakeXhr.instances.push(this);
  }
}

beforeEach(() => {
  FakeXhr.instances = [];
  FakeXhr.script = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
});

const file = new File(['abcdefghij'], 'a.jpg', { type: 'image/jpeg' });
const noSleep = { sleep: async () => {} };

describe('uploadToDriveSession', () => {
  it('resolves on a 2xx response', async () => {
    FakeXhr.script = [{ status: 200 }];
    await expect(
      uploadToDriveSession('https://upload/x', file, undefined, noSleep),
    ).resolves.toBeUndefined();
    expect(FakeXhr.instances[0].headers['Content-Type']).toBe('image/jpeg');
  });

  it('rejects on a permanent error status without retrying', async () => {
    FakeXhr.script = [{ status: 403, responseText: 'forbidden' }];
    await expect(
      uploadToDriveSession('https://upload/x', file, undefined, noSleep),
    ).rejects.toThrow('403');
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('rejects on a network or CORS error once all attempts failed', async () => {
    FakeXhr.script = Array.from({ length: 10 }, () => ({
      status: 0,
      networkError: true,
    }));
    await expect(
      uploadToDriveSession('https://upload/x', file, undefined, noSleep),
    ).rejects.toThrow(/CORS/);
  });

  it('reports progress', async () => {
    FakeXhr.script = [{ status: 200, progress: { loaded: 5, total: 10 } }];
    const onProgress = vi.fn();
    await uploadToDriveSession('https://upload/x', file, onProgress, noSleep);
    expect(onProgress).toHaveBeenCalledWith(5, 10);
  });

  it('resumes after a throttled upload from the confirmed offset', async () => {
    FakeXhr.script = [
      { status: 429 },
      // Statusabfrage: die ersten vier Bytes sind angekommen.
      { status: 308, range: 'bytes=0-3' },
      { status: 200 },
    ];
    await uploadToDriveSession('https://upload/x', file, undefined, noSleep);

    const [, query, resume] = FakeXhr.instances;
    expect(query.headers['Content-Range']).toBe('bytes */10');
    expect(query.body).toBeUndefined();
    expect(resume.headers['Content-Range']).toBe('bytes 4-9/10');
    expect((resume.body as Blob).size).toBe(6);
  });

  it('restarts from zero when the session reports no bytes', async () => {
    FakeXhr.script = [
      { status: 0, networkError: true },
      { status: 308 },
      { status: 201 },
    ];
    await uploadToDriveSession('https://upload/x', file, undefined, noSleep);
    const resume = FakeXhr.instances[2];
    expect(resume.headers['Content-Range']).toBe('bytes 0-9/10');
  });

  it('is done when the status query says the upload completed', async () => {
    FakeXhr.script = [{ status: 503 }, { status: 200 }];
    await uploadToDriveSession('https://upload/x', file, undefined, noSleep);
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('retries a 403 rate limit error', async () => {
    FakeXhr.script = [
      { status: 403, responseText: '{"reason":"userRateLimitExceeded"}' },
      { status: 308, range: 'bytes=0-9' },
      { status: 200 },
    ];
    await expect(
      uploadToDriveSession('https://upload/x', file, undefined, noSleep),
    ).resolves.toBeUndefined();
  });
});
