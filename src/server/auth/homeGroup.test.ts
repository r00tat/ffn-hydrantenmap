import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getMock, updateMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: (uid: string) => ({
        get: () => getMock(uid),
        update: (data: unknown) => updateMock(uid, data),
      }),
    }),
  },
}));

import { FieldValue } from 'firebase-admin/firestore';
import { writeHomeGroup } from './homeGroup';

function userDoc(data: Record<string, unknown> | undefined) {
  return { exists: !!data, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue(userDoc({ groupRoles: { ffnd: [], abc: ['gruppenadmin'] } }));
});

describe('writeHomeGroup', () => {
  it('setzt eine Gruppe, in der der Benutzer Mitglied ist', async () => {
    await expect(writeHomeGroup('u1', 'abc')).resolves.toEqual({ homeGroup: 'abc' });
    expect(updateMock).toHaveBeenCalledWith('u1', { homeGroup: 'abc' });
  });

  it('löscht das Feld bei leerer Angabe', async () => {
    await expect(writeHomeGroup('u1', '')).resolves.toEqual({ homeGroup: undefined });
    expect(updateMock).toHaveBeenCalledWith('u1', { homeGroup: FieldValue.delete() });
  });

  it('weist eine Gruppe ohne Mitgliedschaft ab und schreibt nichts', async () => {
    await expect(writeHomeGroup('u1', 'fremd')).resolves.toEqual({ error: 'notMember' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('prüft gegen die übergebene Mitgliedschaft, wenn sie sich gerade ändert', async () => {
    await expect(writeHomeGroup('u1', 'neu', ['neu'])).resolves.toEqual({ homeGroup: 'neu' });
    expect(getMock).not.toHaveBeenCalled();
  });

  it('meldet einen unbekannten Benutzer', async () => {
    getMock.mockResolvedValue(userDoc(undefined));
    await expect(writeHomeGroup('u1', 'abc')).resolves.toEqual({ error: 'notFound' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('liest auch nicht migrierte Benutzer über das alte Feld groups', async () => {
    getMock.mockResolvedValue(userDoc({ groups: ['allUsers', 'ffnd'] }));
    await expect(writeHomeGroup('u1', 'ffnd')).resolves.toEqual({ homeGroup: 'ffnd' });
  });
});
