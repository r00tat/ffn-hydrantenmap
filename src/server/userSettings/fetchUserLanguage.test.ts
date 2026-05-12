import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { docGet, docMock, collectionMock } = vi.hoisted(() => {
  const docGet = vi.fn();
  const docMock = vi.fn(() => ({ get: docGet }));
  const collectionMock = vi.fn(() => ({ doc: docMock }));
  return { docGet, docMock, collectionMock };
});

vi.mock('../firebase/admin', () => ({
  firestore: { collection: collectionMock },
}));

import { fetchUserLanguage } from './fetchUserLanguage';

describe('fetchUserLanguage', () => {
  beforeEach(() => {
    docGet.mockReset();
    docMock.mockClear();
    collectionMock.mockClear();
  });

  it('returns the stored locale when present', async () => {
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ language: 'en' }),
    });
    await expect(fetchUserLanguage('uid')).resolves.toBe('en');
    expect(collectionMock).toHaveBeenCalledWith('userSettings');
    expect(docMock).toHaveBeenCalledWith('uid');
  });

  it('falls back to the default locale when no document exists', async () => {
    docGet.mockResolvedValue({ exists: false });
    await expect(fetchUserLanguage('uid')).resolves.toBe('de');
  });

  it('falls back to the default locale when the stored value is unsupported', async () => {
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({ language: 'fr' }),
    });
    await expect(fetchUserLanguage('uid')).resolves.toBe('de');
  });

  it('falls back to the default locale on errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    docGet.mockRejectedValue(new Error('boom'));
    await expect(fetchUserLanguage('uid')).resolves.toBe('de');
    warn.mockRestore();
  });
});
