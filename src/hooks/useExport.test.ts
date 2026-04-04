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
  addDoc: vi.fn(() =>
    Promise.resolve({ id: 'new-firecall-id', path: 'call/new-firecall-id' })
  ),
  getDoc: vi.fn(() =>
    Promise.resolve({
      data: () => ({ name: 'Test Einsatz', date: '2026-01-01' }),
    })
  ),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  collection: vi.fn((...args: unknown[]) => ({
    path: args.filter((a) => typeof a === 'string').join('/'),
  })),
  query: vi.fn((col: unknown) => col),
  orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: mockBatchSet,
    commit: mockBatchCommit.mockResolvedValue(undefined),
  })),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

import {
  type FirecallExport,
  type ExportDrawingItem,
  type ExportHistoryEntry,
  type ExportFirecallAttachment,
  blobFromBase64String,
  exportFirecall,
  importFirecall,
} from './useExport';
import { writeBatch, getDocs, addDoc } from 'firebase/firestore';

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

      // Should call getDocs for: items, chat, layers, history, locations, kostenersatz, auditlog (7 calls)
      expect(getDocsMock).toHaveBeenCalledTimes(7);
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

    it('should handle batch size limit by chunking', async () => {
      // Create more than 499 items to trigger chunking
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

      // writeBatch should be called at least twice for items (600 items > 499 limit)
      const batchCallCount = (writeBatch as Mock).mock.calls.length;
      expect(batchCallCount).toBeGreaterThanOrEqual(2);
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
  });
});
