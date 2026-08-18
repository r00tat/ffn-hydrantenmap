import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ensureFolder, findFolder, resolveFirecallFolder } from './firecallFolder';

const NOW = new Date('2026-08-16T09:00:00Z');

interface FakeFile {
  id: string;
  name: string;
  parents: string[];
  createdTime: string;
  trashed?: boolean;
}

/**
 * Minimaler Drive-Doppelgänger: kennt nur Ordner, `q`-Ausdrücke werden nicht
 * geparst, sondern über die mitgegebenen Parameter nachgebildet.
 */
function fakeDrive(files: FakeFile[]) {
  let next = files.length + 1;
  const calls: string[] = [];
  const client = {
    files: {
      list: vi.fn(async ({ q }: { q: string }) => {
        calls.push(`list:${q}`);
        const parent = /'([^']+)' in parents/.exec(q)?.[1];
        const name = /name = '((?:[^'\\]|\\.)*)'/
          .exec(q)?.[1]
          .replace(/\\(.)/g, '$1');
        return {
          data: {
            files: files
              .filter(
                (f) => !f.trashed && f.parents.includes(parent!) && f.name === name,
              )
              .sort((a, b) => a.createdTime.localeCompare(b.createdTime)),
          },
        };
      }),
      create: vi.fn(async ({ requestBody }: any) => {
        const file: FakeFile = {
          id: `id${next++}`,
          name: requestBody.name,
          parents: requestBody.parents,
          createdTime: '2026-08-16T09:00:00.000Z',
        };
        files.push(file);
        calls.push(`create:${file.name}`);
        return { data: { id: file.id, name: file.name } };
      }),
      get: vi.fn(async ({ fileId }: { fileId: string }) => {
        const file = files.find((f) => f.id === fileId && !f.trashed);
        if (!file) {
          const err: any = new Error('not found');
          err.code = 404;
          throw err;
        }
        return {
          data: {
            id: file.id,
            name: file.name,
            parents: file.parents,
            trashed: false,
            webViewLink: `https://drive.google.com/drive/folders/${file.id}`,
          },
        };
      }),
      update: vi.fn(
        async ({ fileId, requestBody, addParents, removeParents }: any) => {
          const file = files.find((f) => f.id === fileId)!;
          if (requestBody?.name) file.name = requestBody.name;
          if (removeParents) {
            file.parents = file.parents.filter((p) => p !== removeParents);
          }
          if (addParents) file.parents = [...file.parents, addParents];
          calls.push(`update:${fileId}`);
          return { data: { id: file.id, name: file.name } };
        },
      ),
    },
  };
  return { client: client as any, files, calls };
}

describe('findFolder', () => {
  it('finds an existing folder by name in a parent', async () => {
    const { client } = fakeDrive([
      {
        id: 'y1',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-01-01T00:00:00Z',
      },
    ]);
    const found = await findFolder(client, 'base', '2026');
    expect(found?.id).toBe('y1');
  });

  it('escapes quotes in the name', async () => {
    const { client, calls } = fakeDrive([
      {
        id: 'f1',
        name: "2026-08-16_O'Brien",
        parents: ['y1'],
        createdTime: '2026-08-16T00:00:00Z',
      },
    ]);
    const found = await findFolder(client, 'y1', "2026-08-16_O'Brien");
    expect(found?.id).toBe('f1');
    expect(calls[0]).toContain("\\'Brien");
  });

  it('picks the oldest when a race created two folders', async () => {
    const { client } = fakeDrive([
      {
        id: 'new',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-05-01T00:00:00Z',
      },
      {
        id: 'old',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-01-01T00:00:00Z',
      },
    ]);
    expect((await findFolder(client, 'base', '2026'))?.id).toBe('old');
  });

  it('returns undefined when nothing matches', async () => {
    const { client } = fakeDrive([]);
    expect(await findFolder(client, 'base', '2026')).toBeUndefined();
  });
});

describe('ensureFolder', () => {
  it('reuses a folder that already exists', async () => {
    const { client, calls } = fakeDrive([
      {
        id: 'y1',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(await ensureFolder(client, 'base', '2026')).toBe('y1');
    expect(calls.some((c) => c.startsWith('create:'))).toBe(false);
  });

  it('creates the folder when it is missing', async () => {
    const { client, files } = fakeDrive([]);
    const id = await ensureFolder(client, 'base', '2026');
    expect(files.find((f) => f.id === id)?.name).toBe('2026');
  });
});

describe('resolveFirecallFolder', () => {
  it('creates year and Einsatz folder on first upload', async () => {
    const { client, files } = fakeDrive([]);
    const result = await resolveFirecallFolder(
      client,
      'base',
      { name: 'Zimmerbrand Hauptstraße', date: '2026-08-16T11:10:00Z' },
      undefined,
      NOW,
    );
    expect(result.folderName).toBe('2026-08-16_Zimmerbrand Hauptstraße');
    const year = files.find((f) => f.name === '2026')!;
    expect(year.parents).toEqual(['base']);
    const folder = files.find((f) => f.id === result.folderId)!;
    expect(folder.parents).toEqual([year.id]);
    expect(result.created).toBe(true);
  });

  it('reuses a folder created by hand in Drive', async () => {
    const { client, calls } = fakeDrive([
      {
        id: 'y1',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-01-01T00:00:00Z',
      },
      {
        id: 'f1',
        name: '2026-08-16_Zimmerbrand Hauptstraße',
        parents: ['y1'],
        createdTime: '2026-08-16T00:00:00Z',
      },
    ]);
    const result = await resolveFirecallFolder(
      client,
      'base',
      { name: 'Zimmerbrand Hauptstraße', date: '2026-08-16T11:10:00Z' },
      undefined,
      NOW,
    );
    expect(result.folderId).toBe('f1');
    expect(calls.some((c) => c.startsWith('create:'))).toBe(false);
  });

  it('keeps the known folder id and does nothing when the name still matches', async () => {
    const { client, calls } = fakeDrive([
      {
        id: 'y1',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-01-01T00:00:00Z',
      },
      {
        id: 'f1',
        name: '2026-08-16_Zimmerbrand Hauptstraße',
        parents: ['y1'],
        createdTime: '2026-08-16T00:00:00Z',
      },
    ]);
    const result = await resolveFirecallFolder(
      client,
      'base',
      { name: 'Zimmerbrand Hauptstraße', date: '2026-08-16T11:10:00Z' },
      'f1',
      NOW,
    );
    expect(result.folderId).toBe('f1');
    expect(result.created).toBe(false);
    expect(calls.some((c) => c.startsWith('update:'))).toBe(false);
  });

  it('renames the folder when the Einsatz was renamed', async () => {
    const { client, files } = fakeDrive([
      {
        id: 'y1',
        name: '2026',
        parents: ['base'],
        createdTime: '2026-01-01T00:00:00Z',
      },
      {
        id: 'f1',
        name: '2026-08-16_Alt',
        parents: ['y1'],
        createdTime: '2026-08-16T00:00:00Z',
      },
    ]);
    await resolveFirecallFolder(
      client,
      'base',
      { name: 'Neu', date: '2026-08-16T11:10:00Z' },
      'f1',
      NOW,
    );
    expect(files.find((f) => f.id === 'f1')!.name).toBe('2026-08-16_Neu');
  });

  it('moves the folder when the Einsatz was moved to another year', async () => {
    const { client, files } = fakeDrive([
      {
        id: 'y1',
        name: '2025',
        parents: ['base'],
        createdTime: '2025-01-01T00:00:00Z',
      },
      {
        id: 'f1',
        name: '2025-12-31_Silvester',
        parents: ['y1'],
        createdTime: '2025-12-31T00:00:00Z',
      },
    ]);
    await resolveFirecallFolder(
      client,
      'base',
      { name: 'Silvester', date: '2026-01-01T11:10:00Z' },
      'f1',
      NOW,
    );
    const folder = files.find((f) => f.id === 'f1')!;
    const year2026 = files.find((f) => f.name === '2026')!;
    expect(folder.parents).toEqual([year2026.id]);
    expect(folder.name).toBe('2026-01-01_Silvester');
  });

  it('creates a new folder when the stored one was deleted in Drive', async () => {
    const { client } = fakeDrive([]);
    const result = await resolveFirecallFolder(
      client,
      'base',
      { name: 'Übung', date: '2026-08-16T11:10:00Z' },
      'weg',
      NOW,
    );
    expect(result.folderId).not.toBe('weg');
    expect(result.created).toBe(true);
  });
});
