import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: () => ({ get: getMock }) }),
  },
}));

const { loadMcpUser, McpUserAccessError } = await import('./userAccess');

function userDoc(data: Record<string, unknown> | undefined) {
  getMock.mockResolvedValue({
    exists: data !== undefined,
    data: () => data,
  });
}

beforeEach(() => {
  getMock.mockReset();
});

describe('loadMcpUser', () => {
  it('liefert Gruppen und Adminflag eines berechtigten Benutzers', async () => {
    userDoc({ authorized: true, isAdmin: true, groups: ['ffnd'] });
    await expect(loadMcpUser('uid-1')).resolves.toEqual({
      uid: 'uid-1',
      isAdmin: true,
      groups: ['allUsers', 'ffnd'],
      fahrtenbuchGeraetemeister: [],
      groupAdmin: [],
    });
  });

  it('ergänzt allUsers auch ohne Gruppen', async () => {
    userDoc({ authorized: true });
    await expect(loadMcpUser('uid-1')).resolves.toMatchObject({
      groups: ['allUsers'],
    });
  });

  it('weist einen nicht autorisierten Benutzer ab', async () => {
    userDoc({ authorized: false, groups: ['ffnd'] });
    await expect(loadMcpUser('uid-1')).rejects.toThrow(McpUserAccessError);
  });

  it('weist einen Benutzer ohne Dokument ab', async () => {
    userDoc(undefined);
    await expect(loadMcpUser('uid-1')).rejects.toThrow(/does not exist/);
  });

  it('weist einen Einsatz-Gast ab', async () => {
    userDoc({ authorized: true, firecall: 'call-1', groups: [] });
    await expect(loadMcpUser('uid-1')).rejects.toThrow(
      /firecall guests cannot use the MCP interface/,
    );
  });

  it('weist einen Gast auch mit Schreibrecht ab', async () => {
    userDoc({ authorized: true, firecall: 'call-1', firecallWrite: true });
    await expect(loadMcpUser('uid-1')).rejects.toThrow(/firecall guests/);
  });

  it('behandelt authorized als strikt boolesch', async () => {
    // Ein Wahrheitswert als Zeichenkette ist im Benutzerdokument historisch
    // vorgekommen; für den MCP-Zugang gilt bewusst nur `true`.
    userDoc({ authorized: 'yes' });
    await expect(loadMcpUser('uid-1')).rejects.toThrow(/not authorized/);
  });
});
