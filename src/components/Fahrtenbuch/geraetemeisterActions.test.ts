import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  actionGroupAdminRequiredMock,
  listUsersMock,
  batchSetMock,
  batchCommitMock,
  docMock,
  collectionMock,
  invalidateMock,
} = vi.hoisted(() => ({
  actionGroupAdminRequiredMock: vi.fn(),
  listUsersMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  docMock: vi.fn(),
  collectionMock: vi.fn(),
  invalidateMock: vi.fn(),
}));

// Der Guard ist gemockt, seine Mandanten-Sperre bleibt aber echt: Die Tests
// unten prüfen weiterhin, dass eine Pseudo-Gruppe abgelehnt wird.
vi.mock('../../app/auth', async () => {
  const { assertTenantGroup } = await vi.importActual<
    typeof import('../../app/groups/groupTypes')
  >('../../app/groups/groupTypes');
  return {
    actionGroupAdminRequired: (groupId: string) => {
      assertTenantGroup(groupId);
      return actionGroupAdminRequiredMock(groupId);
    },
  };
});
vi.mock('../../app/api/users/listUsers', () => ({
  listUsers: () => listUsersMock(),
}));
vi.mock('../../server/auth/userSessionCache', () => ({
  userSessionCache: { invalidate: (uid: string) => invalidateMock(uid) },
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => collectionMock(...args),
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (value: string) => ({ union: value }),
    arrayRemove: (value: string) => ({ remove: value }),
  },
}));

import {
  getFahrtenbuchGeraetemeisterOptions,
  saveFahrtenbuchGeraetemeister,
} from './geraetemeisterActions';

const USERS = [
  {
    uid: 'u1',
    displayName: 'Anna Bauer',
    email: 'anna@ff.at',
    groups: ['ffnd', 'allUsers'],
    fahrtenbuchGeraetemeister: ['ffnd'],
  },
  {
    uid: 'u2',
    displayName: 'Max Mustermann',
    email: 'max@ff.at',
    groups: ['ffnd', 'allUsers'],
  },
  {
    uid: 'u3',
    displayName: 'Fremd Person',
    email: 'fremd@ff.at',
    groups: ['ffxy', 'allUsers'],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  actionGroupAdminRequiredMock.mockResolvedValue({
    user: { id: 'admin1', isAdmin: true },
  });
  listUsersMock.mockResolvedValue(USERS);
  batchCommitMock.mockResolvedValue(undefined);
  docMock.mockImplementation((uid: string) => ({ id: uid }));
  collectionMock.mockReturnValue({ doc: docMock });
});

describe('getFahrtenbuchGeraetemeisterOptions', () => {
  it('gibt nur Mitglieder der Gruppe zurück, alphabetisch', async () => {
    const result = await getFahrtenbuchGeraetemeisterOptions('ffnd');

    expect(result.success).toBe(true);
    expect(result.members.map((m) => m.uid)).toEqual(['u1', 'u2']);
    expect(result.selected).toEqual(['u1']);
  });

  it('lehnt eine Nicht-Mandanten-Gruppe ab', async () => {
    const result = await getFahrtenbuchGeraetemeisterOptions('kostenersatz');

    expect(result.success).toBe(false);
  });

  it('gibt einen Fehler zurück, statt zu werfen, wenn der Gruppen-Admin-Guard scheitert', async () => {
    actionGroupAdminRequiredMock.mockRejectedValueOnce(new Error('kein Gruppen-Admin'));

    const result = await getFahrtenbuchGeraetemeisterOptions('ffnd');

    expect(result).toEqual({
      success: false,
      members: [],
      selected: [],
      error: 'kein Gruppen-Admin',
    });
  });
});

describe('saveFahrtenbuchGeraetemeister', () => {
  it('fügt hinzu und entfernt in einem Batch', async () => {
    const result = await saveFahrtenbuchGeraetemeister('ffnd', ['u2']);

    expect(result.success).toBe(true);
    expect(batchSetMock).toHaveBeenCalledTimes(2);
    expect(batchSetMock).toHaveBeenCalledWith(
      { id: 'u2' },
      { fahrtenbuchGeraetemeister: { union: 'ffnd' } },
      { merge: true },
    );
    expect(batchSetMock).toHaveBeenCalledWith(
      { id: 'u1' },
      { fahrtenbuchGeraetemeister: { remove: 'ffnd' } },
      { merge: true },
    );
    expect(batchCommitMock).toHaveBeenCalledOnce();
  });

  it('invalidiert den Session-Cache jedes berührten Benutzers', async () => {
    await saveFahrtenbuchGeraetemeister('ffnd', ['u2']);

    expect(invalidateMock).toHaveBeenCalledWith('u1');
    expect(invalidateMock).toHaveBeenCalledWith('u2');
  });

  it('schreibt nichts, wenn sich nichts ändert', async () => {
    const result = await saveFahrtenbuchGeraetemeister('ffnd', ['u1']);

    expect(result.success).toBe(true);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('entfernt bei leerer Liste alle', async () => {
    const result = await saveFahrtenbuchGeraetemeister('ffnd', []);

    expect(result.success).toBe(true);
    expect(batchSetMock).toHaveBeenCalledWith(
      { id: 'u1' },
      { fahrtenbuchGeraetemeister: { remove: 'ffnd' } },
      { merge: true },
    );
  });

  it('lehnt eine UID ohne Mitgliedschaft ab, ohne zu schreiben', async () => {
    const result = await saveFahrtenbuchGeraetemeister('ffnd', ['u3']);

    expect(result).toEqual({ success: false, error: 'notAMember' });
    expect(batchCommitMock).not.toHaveBeenCalled();
  });
});
