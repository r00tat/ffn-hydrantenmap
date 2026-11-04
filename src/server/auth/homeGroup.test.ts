import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getMock, updateMock, listMock, batchUpdateMock, commitMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  listMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  commitMock: vi.fn(),
}));

vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: (uid: string) => ({
        uid,
        get: () => getMock(uid),
        update: (data: unknown) => updateMock(uid, data),
      }),
      get: () => listMock(),
    }),
    batch: () => ({
      update: (ref: { uid: string }, data: unknown) => batchUpdateMock(ref.uid, data),
      commit: () => commitMock(),
    }),
  },
}));

import { FieldValue } from 'firebase-admin/firestore';
import { assignHomeGroupToMembers, writeHomeGroup } from './homeGroup';

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

describe('assignHomeGroupToMembers', () => {
  function snapshot(users: Record<string, Record<string, unknown>>) {
    return { docs: Object.entries(users).map(([id, data]) => ({ id, data: () => data })) };
  }

  it('setzt die Gruppe bei allen Mitgliedern, die sie noch nicht haben', async () => {
    listMock.mockResolvedValue(
      snapshot({
        a: { groupRoles: { abc: [] } },
        b: { groupRoles: { abc: [], xyz: [] }, homeGroup: 'xyz' },
        c: { groupRoles: { abc: [] }, homeGroup: 'abc' },
        d: { groupRoles: { xyz: [] } },
      }),
    );

    await expect(assignHomeGroupToMembers('abc')).resolves.toEqual({ updated: 2 });
    expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    expect(batchUpdateMock).toHaveBeenCalledWith('a', { homeGroup: 'abc' });
    expect(batchUpdateMock).toHaveBeenCalledWith('b', { homeGroup: 'abc' });
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('schreibt in Paketen zu höchstens 500 Dokumenten', async () => {
    const users: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 501; i++) users[`u${i}`] = { groupRoles: { abc: [] } };
    listMock.mockResolvedValue(snapshot(users));

    await expect(assignHomeGroupToMembers('abc')).resolves.toEqual({ updated: 501 });
    expect(commitMock).toHaveBeenCalledTimes(2);
  });

  it('schreibt nichts, wenn alle Mitglieder die Gruppe schon haben', async () => {
    listMock.mockResolvedValue(snapshot({ c: { groupRoles: { abc: [] }, homeGroup: 'abc' } }));

    await expect(assignHomeGroupToMembers('abc')).resolves.toEqual({ updated: 0 });
    expect(commitMock).not.toHaveBeenCalled();
  });
});
