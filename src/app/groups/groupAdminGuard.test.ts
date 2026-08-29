import { describe, expect, it, vi } from 'vitest';

// Zwei Import-Stubs, keine Verhaltens-Mocks: `server-only` wirft beim Import
// außerhalb einer Server-Umgebung, und `app/auth` zieht NextAuth samt Firebase
// Admin SDK nach. Geprüft wird die Entscheidung, nicht die Anmeldung.
const actionUserRequiredMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../auth', () => ({
  actionUserRequired: actionUserRequiredMock,
}));

import { ApiException } from '../api/errors';
import { actionGroupAdminRequired } from './groupAdminGuard';
import { NON_TENANT_GROUP_IDS } from './groupTypes';

function signedInAs(user: Record<string, unknown>) {
  actionUserRequiredMock.mockResolvedValue({ user });
}

describe('actionGroupAdminRequired', () => {
  it('lässt den globalen Admin ohne Mitgliedschaft durch', async () => {
    signedInAs({ id: 'a1', isAdmin: true, groups: ['allUsers'] });
    await expect(actionGroupAdminRequired('ffnd')).resolves.toBeDefined();
  });

  it('lässt den Gruppen-Admin der Gruppe durch', async () => {
    signedInAs({
      id: 'ga',
      isAdmin: false,
      groups: ['ffnd'],
      groupAdmin: ['ffnd'],
    });
    await expect(actionGroupAdminRequired('ffnd')).resolves.toBeDefined();
  });

  it('weist den Gruppen-Admin in einer anderen Gruppe ab', async () => {
    signedInAs({
      id: 'ga',
      isAdmin: false,
      groups: ['ffnd', 'ffxy'],
      groupAdmin: ['ffnd'],
    });
    await expect(actionGroupAdminRequired('ffxy')).rejects.toThrow(
      /may not administer group ffxy/,
    );
  });

  it('verlangt vom Gruppen-Admin die Mitgliedschaft', async () => {
    signedInAs({ id: 'ga', isAdmin: false, groups: [], groupAdmin: ['ffnd'] });
    await expect(actionGroupAdminRequired('ffnd')).rejects.toThrow(
      ApiException,
    );
  });

  it('weist einen blossen Gerätemeister ab', async () => {
    signedInAs({
      id: 'gm',
      isAdmin: false,
      groups: ['ffnd'],
      fahrtenbuchGeraetemeister: ['ffnd'],
    });
    await expect(actionGroupAdminRequired('ffnd')).rejects.toThrow();
  });

  it('weist ein einfaches Gruppenmitglied ab', async () => {
    signedInAs({ id: 'u1', isAdmin: false, groups: ['ffnd'] });
    await expect(actionGroupAdminRequired('ffnd')).rejects.toThrow();
  });

  it('meldet die Ablehnung als 403', async () => {
    signedInAs({ id: 'u1', isAdmin: false, groups: ['ffnd'] });
    await expect(actionGroupAdminRequired('ffnd')).rejects.toMatchObject({
      status: 403,
    });
  });

  it.each(['', ...NON_TENANT_GROUP_IDS])(
    'weist die Nicht-Mandanten-Gruppe %s auch beim Admin ab',
    async (groupId) => {
      signedInAs({ id: 'a1', isAdmin: true, groups: ['allUsers'] });
      await expect(actionGroupAdminRequired(groupId)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});
