import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actionAdminRequired = vi.fn();
const docSet = vi.fn();
const docGet = vi.fn();
const docDelete = vi.fn();
const filesGet = vi.fn();
const drivesGet = vi.fn();

vi.mock('../../app/auth', () => ({
  actionAdminRequired: () => actionAdminRequired(),
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({ set: docSet, get: docGet, delete: docDelete }),
    }),
  },
}));
vi.mock('../../server/drive/driveClient', () => ({
  driveClient: () => ({
    files: { get: filesGet },
    drives: { get: drivesGet },
  }),
}));

import {
  checkDriveFolder,
  getDriveConfig,
  saveDriveConfig,
} from './driveConfigActions';

beforeEach(() => {
  vi.clearAllMocks();
  actionAdminRequired.mockResolvedValue({ user: { email: 'a@b.c' } });
});

describe('getDriveConfig', () => {
  it('requires an admin', async () => {
    actionAdminRequired.mockRejectedValueOnce(new Error('nope'));
    await expect(getDriveConfig('ffnd')).rejects.toThrow('nope');
  });

  it('returns null when nothing is configured', async () => {
    docGet.mockResolvedValue({ exists: false });
    expect(await getDriveConfig('ffnd')).toBeNull();
  });
});

describe('saveDriveConfig', () => {
  it('trims the folder id and stamps the editor', async () => {
    await saveDriveConfig('ffnd', '  abc123  ');
    expect(docSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'ffnd',
        baseFolderId: 'abc123',
        updatedBy: 'a@b.c',
      }),
    );
  });

  it('rejects an empty folder id', async () => {
    await expect(saveDriveConfig('ffnd', '   ')).rejects.toThrow();
  });
});

describe('checkDriveFolder', () => {
  it('reports folder and shared drive name', async () => {
    filesGet.mockResolvedValue({
      data: {
        id: 'abc',
        name: 'Einsatzfotos',
        mimeType: 'application/vnd.google-apps.folder',
        driveId: 'd1',
      },
    });
    drivesGet.mockResolvedValue({ data: { name: 'FF Neusiedl' } });
    expect(await checkDriveFolder('abc')).toEqual({
      success: true,
      folderName: 'Einsatzfotos',
      driveName: 'FF Neusiedl',
    });
  });

  it('rejects an id that points at a file', async () => {
    filesGet.mockResolvedValue({
      data: { id: 'abc', name: 'foto.jpg', mimeType: 'image/jpeg' },
    });
    expect(await checkDriveFolder('abc')).toEqual({
      success: false,
      error: 'notAFolder',
    });
  });

  it('turns an API error into a failed check instead of throwing', async () => {
    filesGet.mockRejectedValue(new Error('File not found: abc'));
    const result = await checkDriveFolder('abc');
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });
});
