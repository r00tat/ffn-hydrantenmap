import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import-Stubs: `server-only` wirft außerhalb einer Server-Umgebung, und
// `authGuards` zieht über `app/auth` NextAuth samt Firebase Admin SDK nach.
vi.mock('server-only', () => ({}));
vi.mock('../../app/auth', () => ({ actionUserRequired: vi.fn() }));

const { linkGetMock } = vi.hoisted(() => ({ linkGetMock: vi.fn() }));

vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: () => ({ get: linkGetMock }) }),
  },
}));

import { resolveFahrtenbuchShareLink } from './resolveFahrtenbuchShareLink';

const linkDoc = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

describe('resolveFahrtenbuchShareLink', () => {
  beforeEach(() => linkGetMock.mockReset());

  it('liefert Token, Gruppe und linkId für einen gültigen Link', async () => {
    linkGetMock.mockResolvedValue(
      linkDoc({ groupId: 'ffnd', linkId: 'abc123def456', createdAt: 'x' }),
    );
    await expect(resolveFahrtenbuchShareLink('tok')).resolves.toEqual({
      token: 'tok',
      groupId: 'ffnd',
      linkId: 'abc123def456',
    });
  });

  it('lehnt einen leeren Token ab, ohne Firestore zu fragen', async () => {
    await expect(resolveFahrtenbuchShareLink('')).rejects.toMatchObject({ status: 404 });
    expect(linkGetMock).not.toHaveBeenCalled();
  });

  it('lehnt einen unbekannten Token ab', async () => {
    linkGetMock.mockResolvedValue(linkDoc(undefined));
    await expect(resolveFahrtenbuchShareLink('tok')).rejects.toMatchObject({ status: 404 });
  });

  it('lehnt einen widerrufenen Link ab', async () => {
    linkGetMock.mockResolvedValue(
      linkDoc({
        groupId: 'ffnd',
        linkId: 'abc123def456',
        revokedAt: '2026-08-04T10:00:00.000Z',
      }),
    );
    await expect(resolveFahrtenbuchShareLink('tok')).rejects.toMatchObject({ status: 404 });
  });

  it('lehnt einen Link auf eine Nicht-Mandanten-Gruppe ab', async () => {
    linkGetMock.mockResolvedValue(
      linkDoc({ groupId: 'allUsers', linkId: 'abc123def456' }),
    );
    await expect(resolveFahrtenbuchShareLink('tok')).rejects.toMatchObject({ status: 404 });
  });

  it('lehnt einen Token ab, bei dem Firestore einen ungültigen Pfad meldet', async () => {
    linkGetMock.mockRejectedValueOnce(
      new Error('3 INVALID_ARGUMENT: Document path ...'),
    );
    await expect(resolveFahrtenbuchShareLink('a/b')).rejects.toMatchObject({
      status: 404,
      message: 'share link invalid',
    });
  });

  it('lehnt ein Dokument ohne groupId ab', async () => {
    linkGetMock.mockResolvedValue(linkDoc({ createdAt: 'x' }));
    await expect(resolveFahrtenbuchShareLink('tok')).rejects.toMatchObject({ status: 404 });
  });

  // Ohne `linkId` gäbe es keine nicht geheime Kennung für `createdBy` — der
  // Token dürfte dort nicht landen, also ist so ein Dokument fehlerhaft.
  it('lehnt ein Dokument ohne linkId ab', async () => {
    linkGetMock.mockResolvedValue(linkDoc({ groupId: 'ffnd', createdAt: 'x' }));
    await expect(resolveFahrtenbuchShareLink('tok')).rejects.toMatchObject({
      status: 404,
      message: 'share link invalid',
    });
  });

  it('lehnt einen Token aus nur Leerzeichen ab, ohne Firestore zu fragen', async () => {
    await expect(resolveFahrtenbuchShareLink('   ')).rejects.toMatchObject({ status: 404 });
    expect(linkGetMock).not.toHaveBeenCalled();
  });

  it('meldet alle Fehlschläge mit derselben Nachricht', async () => {
    const messages: string[] = [];
    for (const data of [
      undefined,
      { groupId: 'ffnd', linkId: 'abc123def456', revokedAt: 'x' },
      { groupId: 'allUsers', linkId: 'abc123def456' },
      { groupId: 'ffnd' },
    ]) {
      linkGetMock.mockResolvedValue(linkDoc(data));
      await resolveFahrtenbuchShareLink('tok').catch((err: Error) => messages.push(err.message));
    }
    linkGetMock.mockRejectedValueOnce(new Error('3 INVALID_ARGUMENT: Document path ...'));
    await resolveFahrtenbuchShareLink('a/b').catch((err: Error) => messages.push(err.message));
    expect(new Set(messages).size).toBe(1);
  });
});
