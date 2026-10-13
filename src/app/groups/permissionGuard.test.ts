import { beforeEach, describe, expect, it, vi } from 'vitest';

// Zwei Import-Stubs: `server-only` wirft außerhalb
// des Servers, `app/auth` zieht NextAuth nach. Geprüft wird die Entscheidung.
const { actionUserRequiredMock, firecallGetMock } = vi.hoisted(() => ({
  actionUserRequiredMock: vi.fn(),
  firecallGetMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../auth', () => ({
  actionUserRequired: actionUserRequiredMock,
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: (id: string) => ({ get: () => firecallGetMock(id) }) }),
  },
}));

import { NON_TENANT_GROUP_IDS } from '../../common/tenantGroups';
import {
  actionFirecallPermissionRequired,
  actionPermissionRequired,
} from './permissionGuard';

function signedInAs(user: Record<string, unknown>) {
  actionUserRequiredMock.mockResolvedValue({ user });
}

function firecall(data: Record<string, unknown> | undefined) {
  firecallGetMock.mockImplementation(async (id: string) => ({
    id,
    exists: data !== undefined,
    data: () => data,
  }));
}

beforeEach(() => {
  actionUserRequiredMock.mockReset();
  firecallGetMock.mockReset();
});

describe('actionPermissionRequired', () => {
  it('lässt den globalen Admin ohne Mitgliedschaft durch', async () => {
    signedInAs({ id: 'a', isAdmin: true, groupRoles: {} });
    await expect(actionPermissionRequired('ffnd', 'gruppe.manage')).resolves.toBeDefined();
  });

  it('lässt durch, wer das Recht in der Gruppe hat', async () => {
    signedInAs({ id: 'gm', groupRoles: { ffnd: ['geraetemeister'] } });
    const session = await actionPermissionRequired('ffnd', 'geraete.manage');
    expect(session.user.id).toBe('gm');
  });

  it('weist ab, wer das Recht nur in einer anderen Gruppe hat', async () => {
    signedInAs({ id: 'gm', groupRoles: { ffnd: ['geraetemeister'], ffxy: [] } });
    await expect(actionPermissionRequired('ffxy', 'geraete.manage')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('weist ein blosses Mitglied ab', async () => {
    signedInAs({ id: 'u', groupRoles: { ffnd: [] } });
    await expect(actionPermissionRequired('ffnd', 'gruppe.manage')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('liest keine alten Rollenfelder mehr', async () => {
    signedInAs({ id: 'u', groups: ['ffnd'], groupAdmin: ['ffnd'] });
    await expect(actionPermissionRequired('ffnd', 'gruppe.manage')).rejects.toMatchObject({
      status: 403,
    });
  });

  it.each(['', ...NON_TENANT_GROUP_IDS])(
    'weist die Nicht-Mandanten-Gruppe %s auch beim Admin ab',
    async (groupId) => {
      signedInAs({ id: 'a', isAdmin: true });
      await expect(actionPermissionRequired(groupId, 'gruppe.manage')).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});

describe('actionFirecallPermissionRequired', () => {
  it('prüft das Recht in der Gruppe des Einsatzes und liefert den Einsatz', async () => {
    signedInAs({ id: 'k', groupRoles: { ffnd: ['kostenersatz'] } });
    firecall({ group: 'ffnd', name: 'Brand' });

    const result = await actionFirecallPermissionRequired('fc1', 'kostenersatz.use');

    expect(firecallGetMock).toHaveBeenCalledWith('fc1');
    expect(result.firecall).toMatchObject({ id: 'fc1', group: 'ffnd', name: 'Brand' });
    expect(result.session.user.id).toBe('k');
  });

  it('weist ab, wer das Recht nur in einer anderen Gruppe hat', async () => {
    signedInAs({ id: 'k', groupRoles: { ffxy: ['kostenersatz'], ffnd: [] } });
    firecall({ group: 'ffnd' });
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('weist ein Einsatzmitglied ohne das Recht ab', async () => {
    signedInAs({ id: 'u', groupRoles: { ffnd: [] } });
    firecall({ group: 'ffnd' });
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('weist einen Einsatz-Gast immer ab', async () => {
    signedInAs({ id: 'g', firecall: 'fc1', firecallWrite: true, groupRoles: {} });
    firecall({ group: 'ffnd' });
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lässt den globalen Admin durch', async () => {
    signedInAs({ id: 'a', isAdmin: true, groupRoles: {} });
    firecall({ group: 'ffnd' });
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).resolves.toBeDefined();
  });

  it('meldet einen unbekannten Einsatz als 404', async () => {
    signedInAs({ id: 'a', isAdmin: true });
    firecall(undefined);
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('weist einen Einsatz ohne Gruppe ab', async () => {
    signedInAs({ id: 'a', isAdmin: true });
    firecall({ name: 'ohne Gruppe' });
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('weist einen Einsatz der Pseudo-Gruppe allUsers ab', async () => {
    signedInAs({ id: 'u', groupRoles: { ffnd: ['kostenersatz'] } });
    firecall({ group: 'allUsers' });
    await expect(
      actionFirecallPermissionRequired('fc1', 'kostenersatz.use'),
    ).rejects.toThrow();
  });
});
