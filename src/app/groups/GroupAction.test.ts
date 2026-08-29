import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  actionAdminRequiredMock,
  memberBatchUpdateMock,
  memberBatchCommitMock,
  roleBatchSetMock,
  roleBatchCommitMock,
  invalidateMock,
  setClaimsMock,
  usersGetMock,
  groupSetMock,
} = vi.hoisted(() => ({
  actionAdminRequiredMock: vi.fn(),
  memberBatchUpdateMock: vi.fn(),
  memberBatchCommitMock: vi.fn(),
  roleBatchSetMock: vi.fn(),
  roleBatchCommitMock: vi.fn(),
  invalidateMock: vi.fn(),
  setClaimsMock: vi.fn(),
  usersGetMock: vi.fn(),
  groupSetMock: vi.fn(),
}));

vi.mock('../auth', () => ({
  actionAdminRequired: () => actionAdminRequiredMock(),
  actionUserRequired: () => actionAdminRequiredMock(),
}));
vi.mock('../api/users/[uid]/updateUser', () => ({
  setCustomClaimsForUser: (uid: string, data: unknown) =>
    setClaimsMock(uid, data),
}));
vi.mock('../../server/auth/userSessionCache', () => ({
  userSessionCache: { invalidate: (uid: string) => invalidateMock(uid) },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (value: string) => ({ union: value }),
    arrayRemove: (value: string) => ({ remove: value }),
  },
}));

// Zwei aufeinanderfolgende `batch()`-Aufrufe: erst die Mitgliedschaft, dann
// die Rollen. Der Mock hält sie auseinander, damit die Erwartungen unten
// benennen können, was in welchem Durchgang geschrieben wurde.
let batchCall = 0;
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (name: string) => {
      if (name === 'user') {
        return {
          get: () => usersGetMock(),
          doc: (uid: string) => ({ id: uid, path: `user/${uid}` }),
        };
      }
      return {
        doc: (id: string) => ({ id, set: groupSetMock }),
      };
    },
    batch: () => {
      batchCall += 1;
      return batchCall === 1
        ? { update: memberBatchUpdateMock, commit: memberBatchCommitMock }
        : { set: roleBatchSetMock, commit: roleBatchCommitMock };
    },
  },
}));

import { updateGroupAction } from './GroupAction';

function userDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

const GROUP = { id: 'ffnd', name: 'FF Neusiedl am See' };

beforeEach(() => {
  vi.clearAllMocks();
  batchCall = 0;
  actionAdminRequiredMock.mockResolvedValue({ user: { id: 'a1' } });
  groupSetMock.mockResolvedValue(undefined);
  memberBatchCommitMock.mockResolvedValue(undefined);
  roleBatchCommitMock.mockResolvedValue(undefined);
  setClaimsMock.mockResolvedValue(undefined);
});

describe('updateGroupAction — Gruppen-Admins', () => {
  it('trägt einen neuen Gruppen-Admin mit arrayUnion ein', async () => {
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groups: ['ffnd'] })],
    });

    await updateGroupAction(GROUP, ['u1'], ['u1']);

    expect(roleBatchSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      { groupAdmin: { union: 'ffnd' } },
      { merge: true },
    );
  });

  it('entfernt einen abgewählten Gruppen-Admin mit arrayRemove', async () => {
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groups: ['ffnd'], groupAdmin: ['ffnd'] })],
    });

    await updateGroupAction(GROUP, ['u1'], []);

    expect(roleBatchSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      { groupAdmin: { remove: 'ffnd' } },
      { merge: true },
    );
  });

  it('schreibt nichts, wenn sich an den Rollen nichts ändert', async () => {
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groups: ['ffnd'], groupAdmin: ['ffnd'] })],
    });

    await updateGroupAction(GROUP, ['u1'], ['u1']);

    expect(roleBatchSetMock).not.toHaveBeenCalled();
    expect(roleBatchCommitMock).not.toHaveBeenCalled();
  });

  it('macht einen Nicht-Mitglied nicht zum Gruppen-Admin', async () => {
    usersGetMock.mockResolvedValue({
      docs: [userDoc('u1', { groups: [] })],
    });

    await updateGroupAction(GROUP, [], ['u1']);

    expect(roleBatchSetMock).not.toHaveBeenCalled();
  });

  it('nimmt einem ausscheidenden Mitglied beide Gruppenrollen', async () => {
    usersGetMock.mockResolvedValue({
      docs: [
        userDoc('u1', {
          groups: ['ffnd'],
          groupAdmin: ['ffnd'],
          fahrtenbuchGeraetemeister: ['ffnd'],
        }),
      ],
    });

    await updateGroupAction(GROUP, [], []);

    expect(roleBatchSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      { groupAdmin: { remove: 'ffnd' } },
      { merge: true },
    );
    expect(roleBatchSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      { fahrtenbuchGeraetemeister: { remove: 'ffnd' } },
      { merge: true },
    );
  });

  it('lässt die Gerätemeister-Rolle eines bleibenden Mitglieds unangetastet', async () => {
    usersGetMock.mockResolvedValue({
      docs: [
        userDoc('u1', {
          groups: ['ffnd'],
          fahrtenbuchGeraetemeister: ['ffnd'],
        }),
      ],
    });

    await updateGroupAction(GROUP, ['u1'], []);

    expect(roleBatchSetMock).not.toHaveBeenCalled();
  });

  it('invalidiert den Session-Cache jedes berührten Benutzers', async () => {
    usersGetMock.mockResolvedValue({
      docs: [
        userDoc('u1', { groups: ['ffnd'] }),
        userDoc('u2', { groups: ['ffnd'], groupAdmin: ['ffnd'] }),
        userDoc('u3', { groups: [] }),
      ],
    });

    await updateGroupAction(GROUP, ['u1', 'u2', 'u3'], ['u1']);

    // u1 wird Admin, u2 verliert die Rolle, u3 kommt neu in die Gruppe.
    expect(invalidateMock).toHaveBeenCalledWith('u1');
    expect(invalidateMock).toHaveBeenCalledWith('u2');
    expect(invalidateMock).toHaveBeenCalledWith('u3');
  });
});
