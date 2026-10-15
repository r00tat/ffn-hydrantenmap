import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { openResumableSession } from './uploadSession';

function response(status: number, body = '', location?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(location ? { location } : {}),
    text: async () => body,
  } as unknown as Response;
}

const FILE = { name: 'a.jpg', mimeType: 'image/jpeg', size: 10 };

function open(fetchFn: typeof fetch) {
  return openResumableSession({
    token: 'token',
    origin: 'https://app.example',
    folderId: 'folder1',
    file: FILE,
    fetchFn,
    sleep: async () => {},
  });
}

describe('openResumableSession', () => {
  it('returns the upload url of the session', async () => {
    const fetchFn = vi.fn(async () =>
      response(200, '', 'https://upload.example/s1'),
    );
    await expect(open(fetchFn as unknown as typeof fetch)).resolves.toBe(
      'https://upload.example/s1',
    );
  });

  it('retries when Drive throttles with 429', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, '', 'https://upload.example/s1'));
    await expect(open(fetchFn as unknown as typeof fetch)).resolves.toBe(
      'https://upload.example/s1',
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries a 403 rate limit error', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          403,
          JSON.stringify({
            error: { errors: [{ reason: 'userRateLimitExceeded' }] },
          }),
        ),
      )
      .mockResolvedValueOnce(response(200, '', 'https://upload.example/s1'));
    await expect(open(fetchFn as unknown as typeof fetch)).resolves.toBe(
      'https://upload.example/s1',
    );
  });

  it('retries server errors', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, '', 'https://upload.example/s1'));
    await expect(open(fetchFn as unknown as typeof fetch)).resolves.toBe(
      'https://upload.example/s1',
    );
  });

  it('does not retry a plain 403', async () => {
    const fetchFn = vi.fn(async () =>
      response(
        403,
        JSON.stringify({
          error: { errors: [{ reason: 'insufficientFilePermissions' }] },
        }),
      ),
    );
    await expect(open(fetchFn as unknown as typeof fetch)).rejects.toThrow(
      /403/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt', async () => {
    const fetchFn = vi.fn(async () => response(429));
    await expect(open(fetchFn as unknown as typeof fetch)).rejects.toThrow(
      /429/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });
});
