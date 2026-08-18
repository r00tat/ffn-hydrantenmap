import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_UPLOAD_MAX_SIZE } from '../../common/drive';

vi.mock('server-only', () => ({}));

const authorized = vi.fn();
const configGet = vi.fn();
const firecallSet = vi.fn();
const filesList = vi.fn();
const resolveFirecallFolder = vi.fn();

vi.mock('../../app/auth', () => ({
  actionUserAuthorizedForFirecall: (...a: unknown[]) => authorized(...a),
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => ({
      doc: () =>
        name === 'driveConfig'
          ? { get: configGet }
          : { set: firecallSet, get: vi.fn() },
    }),
  },
}));
vi.mock('../../server/drive/driveClient', () => ({
  driveClient: () => ({ files: { list: filesList } }),
}));
vi.mock('../../server/drive/firecallFolder', () => ({
  resolveFirecallFolder: (...a: unknown[]) => resolveFirecallFolder(...a),
}));
vi.mock('../../server/auth/driveAuth', () => ({
  driveAccessToken: async () => 'token',
}));
vi.mock('../../server/auth/baseUrl', () => ({
  requestOrigin: async () => 'https://app.example',
}));

import {
  createDriveUploadSessions,
  getFirecallDriveState,
} from './driveFileActions';

const FIRECALL = {
  id: 'fc1',
  name: 'Zimmerbrand',
  group: 'ffnd',
  date: '2026-08-16T11:10:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  authorized.mockResolvedValue({ ...FIRECALL });
  configGet.mockResolvedValue({
    exists: true,
    data: () => ({ groupId: 'ffnd', baseFolderId: 'base' }),
  });
  resolveFirecallFolder.mockResolvedValue({
    folderId: 'folder1',
    folderName: '2026-08-16_Zimmerbrand',
    folderUrl: 'https://drive.google.com/drive/folders/folder1',
    created: true,
  });
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ location: 'https://upload.example/session' }),
  })) as unknown as typeof fetch;
});

describe('createDriveUploadSessions', () => {
  it('requires write access to the firecall', async () => {
    await createDriveUploadSessions('fc1', [
      { name: 'a.jpg', mimeType: 'image/jpeg', size: 10 },
    ]);
    expect(authorized).toHaveBeenCalledWith('fc1', { requireWrite: true });
  });

  it('sends the Origin header so the session allows CORS', async () => {
    await createDriveUploadSessions('fc1', [
      { name: 'a.jpg', mimeType: 'image/jpeg', size: 10 },
    ]);
    const headers = (global.fetch as any).mock.calls[0][1].headers;
    expect(headers.Origin).toBe('https://app.example');
    expect(headers['X-Upload-Content-Length']).toBe('10');
  });

  it('stores the folder id on the firecall', async () => {
    await createDriveUploadSessions('fc1', [
      { name: 'a.jpg', mimeType: 'image/jpeg', size: 10 },
    ]);
    expect(firecallSet).toHaveBeenCalledWith(
      { driveFolderId: 'folder1' },
      { merge: true },
    );
  });

  it('does not rewrite the folder id when it is unchanged', async () => {
    authorized.mockResolvedValue({ ...FIRECALL, driveFolderId: 'folder1' });
    await createDriveUploadSessions('fc1', [
      { name: 'a.jpg', mimeType: 'image/jpeg', size: 10 },
    ]);
    expect(firecallSet).not.toHaveBeenCalled();
  });

  it('rejects more than 25 files', async () => {
    const files = Array.from({ length: 26 }, (_, i) => ({
      name: `${i}.jpg`,
      mimeType: 'image/jpeg',
      size: 1,
    }));
    await expect(createDriveUploadSessions('fc1', files)).rejects.toThrow(
      /too many files/,
    );
  });

  it('rejects a file above the size limit', async () => {
    await expect(
      createDriveUploadSessions('fc1', [
        {
          name: 'big.mov',
          mimeType: 'video/quicktime',
          size: DRIVE_UPLOAD_MAX_SIZE + 1,
        },
      ]),
    ).rejects.toThrow(/size limit/);
  });

  it('fails clearly when the group has no drive configured', async () => {
    configGet.mockResolvedValue({ exists: false });
    await expect(
      createDriveUploadSessions('fc1', [
        { name: 'a.jpg', mimeType: 'image/jpeg', size: 1 },
      ]),
    ).rejects.toThrow(/no drive configured/);
  });
});

describe('getFirecallDriveState', () => {
  it('reports "not configured" without touching Drive', async () => {
    configGet.mockResolvedValue({ exists: false });
    const state = await getFirecallDriveState('fc1');
    expect(state.configured).toBe(false);
    expect(state.folderName).toBe('2026-08-16_Zimmerbrand');
    expect(filesList).not.toHaveBeenCalled();
  });

  it('returns an empty list before the first upload', async () => {
    const state = await getFirecallDriveState('fc1');
    expect(state).toMatchObject({ configured: true, files: [] });
    expect(filesList).not.toHaveBeenCalled();
  });

  it('lists the files of the folder', async () => {
    authorized.mockResolvedValue({ ...FIRECALL, driveFolderId: 'folder1' });
    filesList.mockResolvedValue({
      data: {
        files: [
          {
            id: 'f1',
            name: 'IMG_1.jpg',
            mimeType: 'image/jpeg',
            webViewLink: 'https://drive/f1',
            createdTime: '2026-08-16T12:00:00Z',
          },
        ],
      },
    });
    const state = await getFirecallDriveState('fc1');
    expect(state.files).toHaveLength(1);
    expect(state.files[0].name).toBe('IMG_1.jpg');
    expect(state.folderUrl).toContain('folder1');
  });
});
