import { beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` wirft außerhalb des Servers; Firestore wird durch zwei
// Dokumente ersetzt — den Einsatz und das Benutzerdokument.
const { docs } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../server/firebase/admin', () => ({
  firestore: {
    collection: (col: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = docs.get(`${col}/${id}`);
          return { id, exists: data !== undefined, data: () => data };
        },
      }),
    }),
  },
}));

import { NON_TENANT_GROUP_IDS } from '../../../../common/tenantGroups';
import { requireKostenersatzForFirecall } from './kostenersatzPdfAccess';

function user(uid: string, data: Record<string, unknown>) {
  docs.set(`user/${uid}`, data);
}

beforeEach(() => {
  docs.clear();
  docs.set('call/fc1', { name: 'Brand', group: 'ffnd' });
});

describe('requireKostenersatzForFirecall', () => {
  it('liefert den Einsatz, wenn der Benutzer Kostenersatz in der Gruppe hat', async () => {
    user('u1', { groupRoles: { ffnd: ['kostenersatz'] } });
    await expect(requireKostenersatzForFirecall('u1', 'fc1')).resolves.toMatchObject({
      id: 'fc1',
      name: 'Brand',
      group: 'ffnd',
    });
  });

  it('lässt den globalen Admin ohne Rolle durch', async () => {
    user('a1', { isAdmin: true });
    await expect(requireKostenersatzForFirecall('a1', 'fc1')).resolves.toMatchObject({
      id: 'fc1',
    });
  });

  it('weist ein Mitglied ohne die Rolle mit 403 ab', async () => {
    user('u2', { groupRoles: { ffnd: ['gruppenadmin'] } });
    await expect(requireKostenersatzForFirecall('u2', 'fc1')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('weist ab, wer Kostenersatz nur in einer anderen Gruppe hat', async () => {
    user('u3', { groupRoles: { ffxy: ['kostenersatz'], ffnd: [] } });
    await expect(requireKostenersatzForFirecall('u3', 'fc1')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('liest die alte Freischaltung in `groups` nicht mehr', async () => {
    user('u4', { groups: ['ffnd', 'kostenersatz'] });
    await expect(requireKostenersatzForFirecall('u4', 'fc1')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('weist einen Einsatz-Gast ab', async () => {
    user('g1', { firecall: 'fc1', firecallWrite: true });
    await expect(requireKostenersatzForFirecall('g1', 'fc1')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('meldet 404 für einen unbekannten Einsatz', async () => {
    user('a1', { isAdmin: true });
    await expect(requireKostenersatzForFirecall('a1', 'nope')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('weist einen Benutzer ohne Benutzerdokument ab', async () => {
    await expect(requireKostenersatzForFirecall('ghost', 'fc1')).rejects.toMatchObject({
      status: 403,
    });
  });

  it.each(NON_TENANT_GROUP_IDS)(
    'weist einen Einsatz der Pseudo-Gruppe %s auch beim Admin ab',
    async (groupId) => {
      docs.set('call/fc2', { name: 'X', group: groupId });
      user('a1', { isAdmin: true });
      await expect(requireKostenersatzForFirecall('a1', 'fc2')).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});
