import { describe, expect, it, vi } from 'vitest';

// Import-Stubs: `server-only` wirft außerhalb einer Server-Umgebung, und
// `app/auth` zieht NextAuth samt Firebase Admin SDK nach.
const actionUserRequiredMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../../app/auth', () => ({
  actionUserRequired: actionUserRequiredMock,
}));

import { ApiException } from '../../app/api/errors';
import { NON_TENANT_GROUP_IDS } from '../../app/groups/groupTypes';
import { actionBekleidungswartRequired } from './bekleidungGuard';

function withUser(user: Record<string, unknown>) {
  actionUserRequiredMock.mockResolvedValue({ user });
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    expect.unreachable('should be rejected');
  } catch (err) {
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).status).toBe(status);
  }
}

describe('actionBekleidungswartRequired', () => {
  it('lässt einen Admin ohne Mitgliedschaft durch', async () => {
    withUser({ id: 'a1', isAdmin: true, groups: ['allUsers'] });
    await expect(actionBekleidungswartRequired('ffnd')).resolves.toBeDefined();
  });

  it('lässt einen Gruppen-Admin der Gruppe durch', async () => {
    withUser({ id: 'g1', groups: ['ffnd'], groupAdmin: ['ffnd'] });
    await expect(actionBekleidungswartRequired('ffnd')).resolves.toBeDefined();
  });

  it('lässt einen Bekleidungswart mit Mitgliedschaft durch', async () => {
    withUser({ id: 'b1', groups: ['ffnd'], bekleidungswart: ['ffnd'] });
    await expect(actionBekleidungswartRequired('ffnd')).resolves.toBeDefined();
  });

  it('weist einen Bekleidungswart ohne Mitgliedschaft mit 403 ab', async () => {
    withUser({ id: 'b1', groups: ['allUsers'], bekleidungswart: ['ffnd'] });
    await expectStatus(actionBekleidungswartRequired('ffnd'), 403);
  });

  it('weist ein einfaches Gruppenmitglied mit 403 ab', async () => {
    withUser({ id: 'u1', groups: ['ffnd'] });
    await expectStatus(actionBekleidungswartRequired('ffnd'), 403);
  });

  it('weist einen Gerätemeister mit 403 ab', async () => {
    withUser({
      id: 'm1',
      groups: ['ffnd'],
      fahrtenbuchGeraetemeister: ['ffnd'],
    });
    await expectStatus(actionBekleidungswartRequired('ffnd'), 403);
  });

  it.each(['', ...NON_TENANT_GROUP_IDS])(
    'weist die Nicht-Mandanten-Gruppe "%s" mit 400 ab, auch beim Admin',
    async (groupId) => {
      withUser({ id: 'a1', isAdmin: true, groups: ['allUsers'] });
      await expectStatus(actionBekleidungswartRequired(groupId), 400);
    },
  );
});
