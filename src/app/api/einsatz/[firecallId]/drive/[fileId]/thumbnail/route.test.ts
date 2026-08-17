import { beforeEach, describe, expect, it, vi } from 'vitest';

const authorized = vi.fn();
const filesGet = vi.fn();

vi.mock('../../../../../../auth', () => ({
  actionUserAuthorizedForFirecall: (...a: unknown[]) => authorized(...a),
}));
vi.mock('../../../../../../../server/drive/driveClient', () => ({
  driveClient: () => ({ files: { get: filesGet } }),
}));
vi.mock('../../../../../../../server/auth/driveAuth', () => ({
  driveAccessToken: async () => 'token',
}));

import { GET } from './route';

const request = new Request('https://app/x') as never;
const params = (fileId: string) =>
  Promise.resolve({ firecallId: 'fc1', fileId });

beforeEach(() => {
  vi.clearAllMocks();
  authorized.mockResolvedValue({ id: 'fc1', driveFolderId: 'folder1' });
  global.fetch = vi.fn(async () => ({
    ok: true,
    body: new ReadableStream(),
    headers: new Headers({ 'content-type': 'image/jpeg' }),
  })) as unknown as typeof fetch;
});

describe('GET drive thumbnail', () => {
  it('serves the thumbnail of a file in the firecall folder', async () => {
    filesGet.mockResolvedValue({
      data: {
        id: 'f1',
        parents: ['folder1'],
        thumbnailLink: 'https://lh3.example/x=s220',
        trashed: false,
      },
    });
    const res = await GET(request, { params: params('f1') });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('private');
    expect((global.fetch as any).mock.calls[0][0]).toContain('=s400');
  });

  it('refuses a file from another folder', async () => {
    filesGet.mockResolvedValue({
      data: { id: 'x', parents: ['fremd'], thumbnailLink: 'https://lh3/x=s220' },
    });
    const res = await GET(request, { params: params('x') });
    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses when the user is not authorized for the firecall', async () => {
    authorized.mockRejectedValue(new Error('not in group'));
    const res = await GET(request, { params: params('f1') });
    expect(res.status).toBe(404);
  });

  it('404s when the firecall has no drive folder yet', async () => {
    authorized.mockResolvedValue({ id: 'fc1' });
    const res = await GET(request, { params: params('f1') });
    expect(res.status).toBe(404);
  });
});
