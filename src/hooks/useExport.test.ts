// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock firebase modules before importing
vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: {},
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  getBlob: vi.fn(),
  getMetadata: vi.fn(),
}));

vi.mock('../components/inputs/FileUploader', () => ({
  uploadFile: vi.fn(),
}));

const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
    id: args[args.length - 1] || 'mock-id',
  })),
  getDoc: vi.fn(() =>
    Promise.resolve({
      data: () => ({ name: 'Test Einsatz', date: '2026-01-01' }),
    })
  ),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getCountFromServer: vi.fn(() =>
    Promise.resolve({ data: () => ({ count: 0 }) })
  ),
  collection: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
  query: vi.fn((col: unknown) => col),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: mockBatchSet,
    commit: mockBatchCommit.mockResolvedValue(undefined),
  })),
}));

// Das Aufteilen auf mehrere Batches ist in `lib/firestoreClient` getestet.
// Hier zählt nur, welche Dokumente `importFirecall` überhaupt übergibt.
const mockCommitInBatches = vi.fn(
  async (
    _firestore: unknown,
    operations: { ref: unknown; data: unknown }[]
  ) => {
    if (operations.length === 0) return;
    const batch = { set: mockBatchSet, commit: mockBatchCommit };
    operations.forEach(({ ref, data }) => batch.set(ref, data));
    await mockBatchCommit();
  }
);

vi.mock('../lib/firestoreClient', () => ({
  addDoc: vi.fn(() =>
    Promise.resolve({ id: 'new-firecall-id', path: 'call/new-firecall-id' })
  ),
  updateDoc: vi.fn(() => Promise.resolve()),
  commitBatch: vi.fn((batch: { commit: () => Promise<void> }) => batch.commit()),
  commitInBatches: (...args: never[]) =>
    (mockCommitInBatches as unknown as (...a: never[]) => Promise<void>)(
      ...args
    ),
}));

import {
  type BackupProgress,
  type BackupWarning,
  type FirecallExport,
  type ExportDrawingItem,
  type ExportHistoryEntry,
  type ExportFirecallAttachment,
  BACKUP_VERSION,
  blobFromBase64String,
  countBackupSections,
  exportFirecall,
  importFirecall,
} from './useExport';
import { getCountFromServer, getDoc, getDocs } from 'firebase/firestore';
import type { FcMarker } from '../components/firebase/firestore';
import { getBlob, getMetadata, ref } from 'firebase/storage';
import { addDoc, updateDoc } from '../lib/firestoreClient';
import { uploadFile } from '../components/inputs/FileUploader';

describe('useExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FirecallExport interface completeness', () => {
    it('should include all subcollections in the export type', () => {
      const exportData: FirecallExport = {
        name: 'Test Einsatz',
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
        firecallAttachments: [],
      };

      expect(exportData).toHaveProperty('items');
      expect(exportData).toHaveProperty('chat');
      expect(exportData).toHaveProperty('layers');
      expect(exportData).toHaveProperty('history');
      expect(exportData).toHaveProperty('locations');
      expect(exportData).toHaveProperty('kostenersatz');
      expect(exportData).toHaveProperty('auditlog');
      expect(exportData).toHaveProperty('firecallAttachments');
    });

    it('should support drawing strokes in export items', () => {
      const drawingItem: ExportDrawingItem = {
        type: 'drawing',
        name: 'Test Drawing',
        strokes: [
          {
            color: '#ff0000',
            width: 3,
            points: [
              [47.0, 16.0],
              [47.1, 16.1],
            ],
            order: 0,
          },
        ],
      };

      expect(drawingItem.strokes).toHaveLength(1);
      expect(drawingItem.strokes![0].points).toEqual([
        [47.0, 16.0],
        [47.1, 16.1],
      ]);
    });

    it('should support snapshot data in history entries', () => {
      const historyEntry: ExportHistoryEntry = {
        description: 'Test Snapshot',
        createdAt: '2026-01-01T12:00:00Z',
        snapshotItems: [
          { id: 'item1', name: 'Vehicle 1', type: 'vehicle' },
        ],
        snapshotLayers: [
          { id: 'layer1', name: 'Layer 1', type: 'layer' },
        ],
      };

      expect(historyEntry.snapshotItems).toHaveLength(1);
      expect(historyEntry.snapshotLayers).toHaveLength(1);
    });

    it('should support firecall attachments with base64 data', () => {
      const attachment: ExportFirecallAttachment = {
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        data: 'base64data...',
        originalUrl: 'gs://bucket/firecall/123/files/photo.jpg',
      };

      expect(attachment.name).toBe('photo.jpg');
      expect(attachment.data).toBe('base64data...');
      expect(attachment.originalUrl).toContain('firecall');
    });
  });

  describe('blobFromBase64String', () => {
    it('should convert base64 string to Blob', () => {
      const base64 = btoa('Hello World');
      const blob = blobFromBase64String(base64, 'text/plain');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/plain');
      expect(blob.size).toBe(11);
    });

    it('should work without mime type', () => {
      const base64 = btoa('Test');
      const blob = blobFromBase64String(base64);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(4);
    });
  });

  describe('exportFirecall', () => {
    it('should fetch all subcollections including auditlog', async () => {
      const getDocsMock = getDocs as Mock;
      getDocsMock.mockResolvedValue({ docs: [] });

      await exportFirecall('test-id');

      // items, chat, layers, mapLayers, history, locations, kostenersatz,
      // auditlog, crew, atemschutzTrupp, atemschutzAusgabe
      expect(getDocsMock).toHaveBeenCalledTimes(11);
    });

    it('sichert ohne Kostenersatz-Recht den Rest und lässt den Kostenersatz weg', async () => {
      (getDocs as Mock).mockImplementation((col: { path?: string }) =>
        col?.path?.endsWith('kostenersatz')
          ? Promise.reject(
              Object.assign(new Error('denied'), { code: 'permission-denied' })
            )
          : Promise.resolve({
              docs: col?.path?.endsWith('chat')
                ? [{ id: 'c1', data: () => ({ message: 'Hallo' }) }]
                : [],
            })
      );

      const result = await exportFirecall('test-id');

      expect(result.kostenersatz).toEqual([]);
      expect(result.chat).toHaveLength(1);
    });

    it('scheitert bei anderen Lesefehlern des Kostenersatzes weiterhin', async () => {
      (getDocs as Mock).mockImplementation((col: { path?: string }) =>
        col?.path?.endsWith('kostenersatz')
          ? Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }))
          : Promise.resolve({ docs: [] })
      );

      await expect(exportFirecall('test-id')).rejects.toThrow('offline');
    });

    it('sichert das Füllprotokoll nicht mehr mit', async () => {
      // Es liegt unter der Gruppe. Mitgesichert und zurückgespielt stünde jede
      // Füllung zweimal da — einmal je Einsatzbezug.
      (getDocs as Mock).mockResolvedValue({ docs: [] });

      const result = await exportFirecall('test-id');

      expect(result).not.toHaveProperty('atemschutzFuellungen');
    });

    it('should stamp the backup version', async () => {
      (getDocs as Mock).mockResolvedValue({ docs: [] });

      const result = await exportFirecall('test-id');

      expect(result.backupVersion).toBe(BACKUP_VERSION);
    });

    it('should export the crew assignments', async () => {
      (getDocs as Mock).mockImplementation((col: { path?: string }) =>
        Promise.resolve({
          docs: col?.path?.endsWith('crew')
            ? [
                {
                  id: 'crew1',
                  data: () => ({
                    recipientId: 'r1',
                    name: 'Max Mustermann',
                    vehicleId: 'v1',
                    vehicleName: 'HLFA1',
                    funktion: 'Maschinist',
                  }),
                },
              ]
            : [],
        })
      );

      const result = await exportFirecall('test-id');

      expect(result.crew).toEqual([
        {
          id: 'crew1',
          recipientId: 'r1',
          name: 'Max Mustermann',
          vehicleId: 'v1',
          vehicleName: 'HLFA1',
          funktion: 'Maschinist',
        },
      ]);
    });

    it('should export the strokes of a drawing inside a history snapshot', async () => {
      // The snapshot keeps drawings in its own item subcollection; their
      // strokes live one level below and were missing from the backup.
      (getDocs as Mock).mockImplementation((col: { path?: string }) => {
        if (col?.path === 'history') {
          return Promise.resolve({
            docs: [
              { id: 'h1', data: () => ({ description: 'Snapshot 1' }) },
            ],
          });
        }
        if (col?.path === 'item') {
          return Promise.resolve({
            docs: [
              {
                id: 'draw1',
                data: () => ({ name: 'Drawing 1', type: 'drawing' }),
              },
            ],
          });
        }
        if (col?.path === 'item/draw1/stroke') {
          return Promise.resolve({
            docs: [
              {
                id: 's1',
                data: () => ({
                  color: '#00ff00',
                  width: 2,
                  points: [47.0, 16.0, 47.2, 16.2],
                  order: 0,
                }),
              },
            ],
          });
        }
        return Promise.resolve({ docs: [] });
      });

      const result = await exportFirecall('test-id');

      const snapshotItems = result.history[0]
        .snapshotItems as ExportDrawingItem[];
      expect(snapshotItems[0].strokes).toEqual([
        {
          id: 's1',
          color: '#00ff00',
          width: 2,
          points: [
            [47.0, 16.0],
            [47.2, 16.2],
          ],
          order: 0,
        },
      ]);
    });

    it('should report progress with a total known after the structure phase', async () => {
      (getDocs as Mock).mockImplementation((col: { path?: string }) => {
        if (col?.path === 'item') {
          return Promise.resolve({
            docs: [
              {
                id: 'draw1',
                data: () => ({ name: 'Skizze', type: 'drawing' }),
              },
              {
                id: 'm1',
                data: () => ({
                  name: 'Marker',
                  type: 'marker',
                  // schon als Objekt — kein Storage-Zugriff nötig
                  attachments: [{ name: 'plan.pdf', data: 'AA==' }],
                }),
              },
            ],
          });
        }
        if (col?.path === 'history') {
          return Promise.resolve({
            docs: [{ id: 'h1', data: () => ({ description: 'Snapshot' }) }],
          });
        }
        return Promise.resolve({ docs: [] });
      });

      const progress: BackupProgress[] = [];
      await exportFirecall('test-id', { onProgress: (p) => progress.push(p) });

      // Solange die Struktur lädt, ist die Gesamtzahl noch unbekannt.
      expect(progress[0]).toEqual({ phase: 'structure', done: 0, total: 0 });

      // eine Zeichnung + ein History-Eintrag + ein Anhang
      const last = progress[progress.length - 1];
      expect(last.total).toBe(3);
      expect(last.done).toBe(3);

      // der Fortschritt darf nie zurückspringen
      const withTotal = progress.filter((p) => p.total > 0);
      const done = withTotal.map((p) => p.done);
      expect(done).toEqual([...done].sort((a, b) => a - b));
      expect(withTotal.every((p) => p.done <= p.total)).toBe(true);
    });

    it('should fetch the top level subcollections in parallel', async () => {
      let concurrent = 0;
      let peak = 0;
      (getDocs as Mock).mockImplementation(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await Promise.resolve();
        concurrent -= 1;
        return { docs: [] };
      });

      await exportFirecall('test-id');

      // elf Untersammlungen, die nicht voneinander abhängen
      expect(peak).toBe(11);
    });

    it('should warn instead of silently dropping an attachment it cannot download', async () => {
      (getDocs as Mock).mockImplementation((col: { path?: string }) =>
        Promise.resolve({
          docs: col?.path?.endsWith('item')
            ? [
                {
                  id: 'm1',
                  data: () => ({
                    name: 'Marker',
                    type: 'marker',
                    attachments: ['/firecall/old/files/uuid-plan.pdf'],
                  }),
                },
              ]
            : [],
        })
      );
      (ref as Mock).mockReturnValue({ name: 'uuid-plan.pdf' });
      (getBlob as Mock).mockRejectedValue(new Error('storage offline'));
      (getMetadata as Mock).mockResolvedValue({
        contentType: 'application/pdf',
      });

      const warnings: BackupWarning[] = [];
      await exportFirecall('test-id', { onWarning: (w) => warnings.push(w) });

      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe('attachmentDownloadFailed');
    });

    it('lässt den Verlauf auf Wunsch weg, ohne ihn zu lesen', async () => {
      const getDocsMock = getDocs as Mock;
      getDocsMock.mockImplementation((col: { path?: string }) =>
        Promise.resolve({
          docs:
            col?.path === 'history'
              ? [{ id: 'h1', data: () => ({ description: 'Snapshot' }) }]
              : [],
        })
      );

      const result = await exportFirecall('test-id', { omit: ['history'] });

      expect(result.history).toEqual([]);
      expect(result.omitted).toEqual(['history']);
      const paths = getDocsMock.mock.calls.map(
        ([col]) => (col as { path?: string }).path
      );
      expect(paths).not.toContain('history');
    });

    it('lässt das Audit-Log auf Wunsch weg, ohne es zu lesen', async () => {
      const getDocsMock = getDocs as Mock;
      getDocsMock.mockResolvedValue({ docs: [] });

      const result = await exportFirecall('test-id', { omit: ['auditlog'] });

      expect(result.auditlog).toEqual([]);
      expect(result.omitted).toEqual(['auditlog']);
      const paths = getDocsMock.mock.calls.map(
        ([col]) => (col as { path?: string }).path
      );
      expect(paths).not.toContain('auditlog');
    });

    it('lädt ohne Anhänge nichts aus dem Storage und behält die Verweise', async () => {
      (getDoc as Mock).mockResolvedValueOnce({
        data: () => ({
          name: 'Test Einsatz',
          attachments: ['/firecall/old/files/uuid-lage.pdf'],
        }),
      });
      (getDocs as Mock).mockImplementation((col: { path?: string }) =>
        Promise.resolve({
          docs:
            col?.path === 'item'
              ? [
                  {
                    id: 'm1',
                    data: () => ({
                      name: 'Marker',
                      type: 'marker',
                      attachments: ['/firecall/old/files/uuid-plan.pdf'],
                    }),
                  },
                ]
              : [],
        })
      );

      const progress: BackupProgress[] = [];
      const result = await exportFirecall('test-id', {
        omit: ['attachments'],
        onProgress: (p) => progress.push(p),
      });

      expect(getBlob).not.toHaveBeenCalled();
      expect(result.firecallAttachments).toBeUndefined();
      expect(result.attachments).toEqual(['/firecall/old/files/uuid-lage.pdf']);
      expect((result.items[0] as FcMarker).attachments).toEqual([
        '/firecall/old/files/uuid-plan.pdf',
      ]);
      // Nicht geladene Anhänge zählen auch nicht zur Gesamtzahl.
      expect(progress[progress.length - 1].total).toBe(0);
    });

    it('vermerkt ohne Auswahl nichts als weggelassen', async () => {
      (getDocs as Mock).mockResolvedValue({ docs: [] });

      const result = await exportFirecall('test-id');

      expect(result.omitted).toBeUndefined();
    });
  });

  describe('countBackupSections', () => {
    it('zählt Verlauf und Audit-Log über Aggregationsabfragen', async () => {
      (getCountFromServer as Mock).mockImplementation(
        (col: { path?: string }) =>
          Promise.resolve({
            data: () => ({ count: col?.path === 'history' ? 120 : 4500 }),
          })
      );

      const counts = await countBackupSections('test-id');

      expect(counts).toEqual({ history: 120, auditlog: 4500 });
      // Die Elemente werden fürs Zählen nicht gelesen — bei 45.000 Stück wäre
      // genau das der teure Teil.
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('liefert ohne Netz einfach keine Zahlen', async () => {
      (getCountFromServer as Mock).mockRejectedValue(new Error('offline'));

      const counts = await countBackupSections('test-id');

      expect(counts).toEqual({});
    });
  });

  describe('importFirecall', () => {
    it('should import all subcollections including auditlog', async () => {
      const firecallData: FirecallExport = {
        name: 'Test Import',
        items: [{ id: 'i1', name: 'Item 1', type: 'marker' }],
        chat: [{ id: 'c1', message: 'Hello', uid: 'u1', timestamp: '2026-01-01' }],
        layers: [{ id: 'l1', name: 'Layer 1', type: 'layer' }],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [
          {
            id: 'a1',
            timestamp: '2026-01-01T00:00:00Z',
            user: 'test@test.com',
            action: 'create',
            elementType: 'marker',
            elementId: 'i1',
            elementName: 'Item 1',
          },
        ],
      };

      await importFirecall(firecallData);

      // Should have created the firecall document
      expect(addDoc).toHaveBeenCalledTimes(1);

      // Should have committed batches for items, chat, layers, auditlog
      expect(mockBatchCommit).toHaveBeenCalled();

      // Verify auditlog was included in batch.set calls
      const setCallArgs = mockBatchSet.mock.calls.map((call: any[]) => call[1]) as Record<string, any>[];
      const auditlogEntry = setCallArgs.find(
        (data) =>
          data && data.action === 'create' && data.user === 'test@test.com'
      );
      expect(auditlogEntry).toBeDefined();
    });

    it('should import drawing strokes as sub-subcollections', async () => {
      const firecallData: FirecallExport = {
        name: 'Test Drawing Import',
        items: [
          {
            id: 'draw1',
            name: 'Drawing 1',
            type: 'drawing',
            strokes: [
              {
                color: '#ff0000',
                width: 3,
                points: [
                  [47.0, 16.0],
                  [47.1, 16.1],
                ],
                order: 0,
              },
            ],
          } as ExportDrawingItem,
        ],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      };

      await importFirecall(firecallData);

      // Verify strokes were written with flattened points
      const setCallArgs = mockBatchSet.mock.calls.map((call: any[]) => call[1]) as Record<string, any>[];
      const strokeEntry = setCallArgs.find(
        (data) =>
          data && data.color === '#ff0000' && Array.isArray(data.points)
      );
      expect(strokeEntry).toBeDefined();
      // Points should be flattened: [[47, 16], [47.1, 16.1]] -> [47, 16, 47.1, 16.1]
      expect(strokeEntry!.points).toEqual([47.0, 16.0, 47.1, 16.1]);
    });

    it('should import history snapshot data', async () => {
      const firecallData: FirecallExport = {
        name: 'Test History Import',
        items: [],
        chat: [],
        layers: [],
        history: [
          {
            id: 'h1',
            description: 'Snapshot 1',
            createdAt: '2026-01-01T12:00:00Z',
            snapshotItems: [
              { id: 'si1', name: 'Snapshot Item', type: 'vehicle' },
            ],
            snapshotLayers: [
              { id: 'sl1', name: 'Snapshot Layer', type: 'layer' },
            ],
          } as ExportHistoryEntry,
        ],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      };

      await importFirecall(firecallData);

      // Should have committed batches: history entry, snapshot items, snapshot layers
      const setCallArgs = mockBatchSet.mock.calls.map((call: any[]) => call[1]) as Record<string, any>[];

      // Verify the history entry itself was written
      const historyEntry = setCallArgs.find(
        (data) => data && data.description === 'Snapshot 1'
      );
      expect(historyEntry).toBeDefined();

      // Verify snapshot items were written
      const snapshotItem = setCallArgs.find(
        (data) => data && data.name === 'Snapshot Item'
      );
      expect(snapshotItem).toBeDefined();

      // Verify snapshot layers were written
      const snapshotLayer = setCallArgs.find(
        (data) => data && data.name === 'Snapshot Layer'
      );
      expect(snapshotLayer).toBeDefined();
    });

    it('should hand every item over for writing, past the batch limit', async () => {
      // 600 items exceed the 500 operation limit of a single writeBatch.
      // The chunking itself is tested in lib/firestoreClient — what matters
      // here is that nothing gets dropped on the way there.
      const items = Array.from({ length: 600 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        type: 'marker' as const,
      }));

      const firecallData: FirecallExport = {
        name: 'Test Large Import',
        items,
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      };

      await importFirecall(firecallData);

      const itemOperations = mockCommitInBatches.mock.calls.find(
        (call) => call[1].length === 600
      );
      expect(itemOperations).toBeDefined();
    });

    it('should handle empty optional collections gracefully', async () => {
      const firecallData: FirecallExport = {
        name: 'Minimal Import',
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      };

      await expect(importFirecall(firecallData)).resolves.toBeDefined();
    });

    it('should import the crew assignments', async () => {
      const firecallData: FirecallExport = {
        name: 'Crew Import',
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
        crew: [
          {
            id: 'crew1',
            recipientId: 'r1',
            name: 'Max Mustermann',
            vehicleId: 'v1',
            vehicleName: 'HLFA1',
            funktion: 'Maschinist',
          },
        ],
      };

      await importFirecall(firecallData);

      const written = mockBatchSet.mock.calls.map(
        (call: any[]) => call[1]
      ) as Record<string, any>[];
      expect(
        written.find((data) => data && data.name === 'Max Mustermann')
      ).toBeDefined();
    });

    it('should give re-uploaded attachments a fresh uuid prefix', async () => {
      // Without the prefix two attachments named alike overwrite each other,
      // and a re-export would chop 37 characters off the bare name.
      (uploadFile as Mock).mockImplementation((_id: string, name: string) => ({
        toString: () => `/firecall/new-firecall-id/files/${name}`,
      }));

      const firecallData: FirecallExport = {
        name: 'Attachment Import',
        items: [
          {
            id: 'm1',
            name: 'Marker',
            type: 'marker',
            attachments: [
              { name: 'plan.pdf', mimeType: 'application/pdf', data: btoa('a') },
              { name: 'plan.pdf', mimeType: 'application/pdf', data: btoa('b') },
            ],
          } as any,
        ],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      };

      await importFirecall(firecallData);

      const uploadedNames = (uploadFile as Mock).mock.calls.map(
        (call: any[]) => call[1] as string
      );
      expect(uploadedNames).toHaveLength(2);
      for (const name of uploadedNames) {
        expect(name).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-plan\.pdf$/
        );
      }
      // both files must survive, not overwrite each other
      expect(uploadedNames[0]).not.toBe(uploadedNames[1]);
    });

    it('should warn when an attachment cannot be uploaded', async () => {
      (uploadFile as Mock).mockRejectedValue(new Error('quota exceeded'));

      const warnings: BackupWarning[] = [];
      await importFirecall(
        {
          name: 'Attachment Import',
          items: [],
          chat: [],
          layers: [],
          history: [],
          locations: [],
          kostenersatz: [],
          auditlog: [],
          firecallAttachments: [
            {
              name: 'plan.pdf',
              mimeType: 'application/pdf',
              data: btoa('a'),
              originalUrl: '/firecall/old/files/uuid-plan.pdf',
            },
          ],
        },
        { onWarning: (w) => warnings.push(w) }
      );

      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe('attachmentUploadFailed');
    });

    it('should not carry stale attachment urls into the copy', async () => {
      // The old urls point at the source firecall's files — if the re-upload
      // fails, the copy must not silently claim the original's attachments.
      (uploadFile as Mock).mockRejectedValue(new Error('quota exceeded'));

      await importFirecall({
        name: 'Attachment Import',
        attachments: ['/firecall/old/files/uuid-plan.pdf'],
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
        firecallAttachments: [
          {
            name: 'plan.pdf',
            mimeType: 'application/pdf',
            data: btoa('a'),
            originalUrl: '/firecall/old/files/uuid-plan.pdf',
          },
        ],
      });

      const created = (addDoc as Mock).mock.calls[0][1] as Record<string, any>;
      expect(created.attachments).toEqual([]);
      expect(updateDoc).not.toHaveBeenCalledWith(expect.anything(), {
        attachments: ['/firecall/old/files/uuid-plan.pdf'],
      });
    });

    it('should keep the attachment urls of a backup without embedded files', async () => {
      // Older backups carry no base64 payload. Restore happens in the same
      // project, so the existing urls stay valid and must survive.
      await importFirecall({
        name: 'Legacy Import',
        attachments: ['/firecall/old/files/uuid-plan.pdf'],
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      });

      const created = (addDoc as Mock).mock.calls[0][1] as Record<string, any>;
      expect(created.attachments).toEqual(['/firecall/old/files/uuid-plan.pdf']);
    });

    it('should write the target group and drop copy-invalid fields', async () => {
      await importFirecall(
        {
          name: 'Group Import',
          group: 'ffnd',
          backupVersion: BACKUP_VERSION,
          fahrtenbuchEntryCount: 3,
          fahrtenbuchRoute: {
            outboundM: 800,
            returnM: 800,
            from: [47.9, 16.8],
            to: [47.94, 16.85],
          },
          items: [],
          chat: [],
          layers: [],
          history: [],
          locations: [],
          kostenersatz: [],
          auditlog: [],
        },
        { group: 'ffpodersdorf' }
      );

      const created = (addDoc as Mock).mock.calls[0][1] as Record<string, any>;
      expect(created.group).toBe('ffpodersdorf');
      // the copy has no Fahrtenbuch entries of its own
      expect(created).not.toHaveProperty('fahrtenbuchEntryCount');
      // the route cache is about the Einsatzort and stays valid
      expect(created.fahrtenbuchRoute).toBeDefined();
      // the version belongs to the file, not to the firecall document
      expect(created).not.toHaveProperty('backupVersion');
      // subcollections must not end up as arrays on the document
      expect(created).not.toHaveProperty('items');
      expect(created).not.toHaveProperty('crew');
    });

    it('should keep the group from the file when no target group is given', async () => {
      await importFirecall({
        name: 'Group Import',
        group: 'ffnd',
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      });

      const created = (addDoc as Mock).mock.calls[0][1] as Record<string, any>;
      expect(created.group).toBe('ffnd');
    });

    it('schreibt den Vermerk über weggelassene Teile nicht an den Einsatz', async () => {
      await importFirecall({
        name: 'Ohne Verlauf',
        omitted: ['history', 'attachments'],
        attachments: ['/firecall/old/files/uuid-lage.pdf'],
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      });

      const created = (addDoc as Mock).mock.calls[0][1] as Record<string, any>;
      expect(created).not.toHaveProperty('omitted');
      // Ohne eingebettete Anhänge bleiben die Verweise stehen.
      expect(created.attachments).toEqual(['/firecall/old/files/uuid-lage.pdf']);
    });

    it('should import the strokes of a drawing inside a history snapshot', async () => {
      const firecallData: FirecallExport = {
        name: 'Snapshot Drawing Import',
        items: [],
        chat: [],
        layers: [],
        history: [
          {
            id: 'h1',
            description: 'Snapshot 1',
            createdAt: '2026-01-01T12:00:00Z',
            snapshotItems: [
              {
                id: 'draw1',
                name: 'Drawing 1',
                type: 'drawing',
                strokes: [
                  {
                    color: '#00ff00',
                    width: 2,
                    points: [
                      [47.0, 16.0],
                      [47.2, 16.2],
                    ],
                    order: 0,
                  },
                ],
              } as ExportDrawingItem,
            ],
            snapshotLayers: [],
          } as ExportHistoryEntry,
        ],
        locations: [],
        kostenersatz: [],
        auditlog: [],
      };

      await importFirecall(firecallData);

      const written = mockBatchSet.mock.calls.map(
        (call: any[]) => call[1]
      ) as Record<string, any>[];

      const stroke = written.find((data) => data && data.color === '#00ff00');
      expect(stroke).toBeDefined();
      expect(stroke!.points).toEqual([47.0, 16.0, 47.2, 16.2]);

      // the item document itself must not carry the strokes array
      const snapshotItem = written.find(
        (data) => data && data.name === 'Drawing 1'
      );
      expect(snapshotItem).toBeDefined();
      expect(snapshotItem).not.toHaveProperty('strokes');
    });

    it('should announce exactly as many steps as it writes', async () => {
      // Der Nenner der Fortschrittsanzeige wird vorab berechnet. Weicht er von
      // dem ab, was tatsächlich geschrieben wird, bleibt der Balken stehen
      // oder springt über 100 % — dieser Test hält beides zusammen.
      (uploadFile as Mock).mockImplementation((_id: string, name: string) => ({
        toString: () => `/firecall/new-firecall-id/files/${name}`,
      }));

      const firecallData: FirecallExport = {
        name: 'Progress Import',
        items: [
          { id: 'm1', name: 'Marker', type: 'marker' },
          {
            id: 'draw1',
            name: 'Skizze',
            type: 'drawing',
            strokes: [
              { color: '#f00', width: 1, points: [[47, 16]], order: 0 },
              { color: '#0f0', width: 1, points: [[47, 16]], order: 1 },
            ],
          } as ExportDrawingItem,
        ],
        chat: [{ id: 'c1', message: 'Hallo', uid: 'u1', timestamp: 'x' }],
        layers: [{ id: 'l1', name: 'Ebene', type: 'layer' }],
        history: [
          {
            id: 'h1',
            description: 'Snapshot',
            createdAt: 'x',
            snapshotItems: [
              {
                id: 'draw1',
                name: 'Skizze',
                type: 'drawing',
                strokes: [
                  { color: '#00f', width: 1, points: [[47, 16]], order: 0 },
                ],
              } as ExportDrawingItem,
            ],
            snapshotLayers: [{ id: 'l1', name: 'Ebene', type: 'layer' }],
          } as ExportHistoryEntry,
        ],
        locations: [],
        kostenersatz: [],
        auditlog: [],
        crew: [
          {
            id: 'crew1',
            recipientId: 'r1',
            name: 'Max',
            vehicleId: null,
            vehicleName: '',
            funktion: 'Feuerwehrmann',
          },
        ],
        firecallAttachments: [
          {
            name: 'plan.pdf',
            data: btoa('a'),
            originalUrl: '/firecall/old/files/uuid-plan.pdf',
          },
        ],
      };

      const progress: BackupProgress[] = [];
      await importFirecall(firecallData, {
        onProgress: (p) => progress.push(p),
      });

      const writtenDocuments = mockCommitInBatches.mock.calls.reduce(
        (sum, call) => sum + call[1].length,
        0
      );
      const uploads = (uploadFile as Mock).mock.calls.length;

      const last = progress[progress.length - 1];
      expect(last.total).toBe(writtenDocuments + uploads);
      expect(last.done).toBe(last.total);
    });

    it('lässt den Kostenersatz ohne Recht in der Zielgruppe weg und meldet es', async () => {
      const warnings: BackupWarning[] = [];
      const progress: BackupProgress[] = [];
      await importFirecall(
        {
          name: 'Ohne Kostenersatz',
          items: [],
          chat: [{ id: 'c1', message: 'Hallo', uid: 'u1', timestamp: '2026-01-01' }],
          layers: [],
          history: [],
          locations: [],
          kostenersatz: [
            { id: 'k1', totalSum: 10 } as unknown as FirecallExport['kostenersatz'][number],
            { id: 'k2', totalSum: 20 } as unknown as FirecallExport['kostenersatz'][number],
          ],
          auditlog: [],
        },
        {
          includeKostenersatz: false,
          onWarning: (w) => warnings.push(w),
          onProgress: (p) => progress.push(p),
        }
      );

      // Der `doc`-Mock setzt die ID ans Ende des Pfads.
      const writtenIds = mockCommitInBatches.mock.calls.flatMap((call) =>
        call[1].map((op) => (op.ref as { id: string }).id)
      );
      expect(writtenIds).not.toContain('k1');
      expect(writtenIds).not.toContain('k2');
      expect(writtenIds).toContain('c1');
      expect(warnings).toContainEqual({ code: 'kostenersatzSkipped', detail: '2' });
      const last = progress[progress.length - 1];
      expect(last.done).toBe(last.total);
    });

    it('spielt nur die eigenen Audit-Log-Einträge zurück und meldet die übrigen', async () => {
      const warnings: BackupWarning[] = [];
      const progress: BackupProgress[] = [];
      const auditEntry = (id: string, user: string) =>
        ({
          id,
          user,
          action: 'update',
          elementType: 'marker',
          elementId: 'm1',
          elementName: 'Marker',
          timestamp: '2026-10-15T10:00:00.000Z',
        }) as FirecallExport['auditlog'][number];
      await importFirecall(
        {
          name: 'Fremdes Audit-Log',
          items: [],
          chat: [],
          layers: [],
          history: [],
          locations: [],
          kostenersatz: [],
          auditlog: [
            auditEntry('a1', 'muster@example.com'),
            auditEntry('a2', 'jemand@example.com'),
            auditEntry('a3', 'andere@example.com'),
          ],
        },
        {
          auditlogUser: 'muster@example.com',
          onWarning: (w) => warnings.push(w),
          onProgress: (p) => progress.push(p),
        }
      );

      const writtenIds = mockCommitInBatches.mock.calls.flatMap((call) =>
        call[1].map((op) => (op.ref as { id: string }).id)
      );
      expect(writtenIds).toContain('a1');
      expect(writtenIds).not.toContain('a2');
      expect(writtenIds).not.toContain('a3');
      expect(warnings).toContainEqual({ code: 'auditlogSkipped', detail: '2' });
      const last = progress[progress.length - 1];
      expect(last.done).toBe(last.total);
    });

    it('spielt den Kostenersatz standardmäßig mit zurück', async () => {
      await importFirecall({
        name: 'Mit Kostenersatz',
        items: [],
        chat: [],
        layers: [],
        history: [],
        locations: [],
        kostenersatz: [
          { id: 'k1', totalSum: 10 } as unknown as FirecallExport['kostenersatz'][number],
        ],
        auditlog: [],
      });

      const writtenIds = mockCommitInBatches.mock.calls.flatMap((call) =>
        call[1].map((op) => (op.ref as { id: string }).id)
      );
      expect(writtenIds).toContain('k1');
    });

    it('should warn about a backup from a newer app version', async () => {
      const warnings: BackupWarning[] = [];
      await importFirecall(
        {
          name: 'Future Import',
          backupVersion: BACKUP_VERSION + 1,
          items: [],
          chat: [],
          layers: [],
          history: [],
          locations: [],
          kostenersatz: [],
          auditlog: [],
        },
        { onWarning: (w) => warnings.push(w) }
      );

      expect(warnings.map((w) => w.code)).toContain('newerBackupVersion');
    });
  });
});
