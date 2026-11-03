import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../server/firebase/admin', () => {
  const ref = (path: string[]) => ({
    path: path.join('/'),
    collection: (c: string) => ({ doc: (d: string) => ref([...path, c, d]) }),
    doc: (d: string) => ref([...path, d]),
  });
  return {
    firestore: {
      collection: (c: string) => ({ doc: (d: string) => ref([c, d]) }),
    },
  };
});

const { loadForeignGeraete } = await import('./atemschutzStammdaten');

describe('loadForeignGeraete', () => {
  it('liest nur die Flaschen anderer Gruppen, gezielt per Pfad', async () => {
    const getAll = vi.fn(async (...refs: Array<{ path: string }>) =>
      refs.map((r) => ({
        exists: !r.path.endsWith('weg'),
        id: r.path.split('/').at(-1),
        data: () => ({ bezeichnung: 'Flasche', volumenLiter: 6.8 }),
      })),
    );
    const geraete = await loadForeignGeraete(
      'bezirk',
      [
        { geraetId: 'f1', geraetGroupId: 'ffnd' },
        { geraetId: 'weg', geraetGroupId: 'ffnd' },
        { geraetId: 'f2', geraetGroupId: 'bezirk' },
      ],
      getAll as never,
    );
    expect(getAll.mock.calls[0].map((r) => r.path)).toEqual([
      'groups/ffnd/atemschutzGeraet/f1',
      'groups/ffnd/atemschutzGeraet/weg',
    ]);
    expect(geraete).toEqual([
      { id: 'f1', groupId: 'ffnd', bezeichnung: 'Flasche', volumenLiter: 6.8 },
    ]);
  });

  it('fragt ohne fremde Flaschen nichts ab', async () => {
    const getAll = vi.fn();
    expect(await loadForeignGeraete('ffnd', [{ geraetId: 'f1' }], getAll)).toEqual([]);
    expect(getAll).not.toHaveBeenCalled();
  });
});
