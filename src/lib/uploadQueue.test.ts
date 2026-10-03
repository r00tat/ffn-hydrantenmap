import { beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({ value: true }));
vi.mock('./connectivity', () => ({
  isOffline: () => offline.value,
  onReconnect: () => () => {},
  checkConnectivityNow: async () => !offline.value,
}));

import {
  createMemoryStorage,
  getQueueSnapshot,
  getQueuedEntries,
  processQueue,
  setQueueStorage,
  setQueueUser,
} from './offlineQueue';
import {
  createUploadHandler,
  filterPendingUploads,
  queueUpload,
  registerUploadHandler,
  UPLOAD_QUEUE_TYPE,
} from './uploadQueue';

const target = { docPath: 'call/fc1', field: 'attachments' };

describe('uploadQueue', () => {
  beforeEach(() => {
    offline.value = true;
    setQueueStorage(createMemoryStorage());
    setQueueUser('u1', true);
  });

  it('legt die Datei samt Ziel in die Warteschlange', async () => {
    const blob = new Blob(['abc'], { type: 'text/plain' });
    await queueUpload({
      storagePath: '/firecall/fc1/files/uuid-a.txt',
      blob,
      contentType: 'text/plain',
      fileName: 'a.txt',
      target,
    });

    const [entry] = await getQueuedEntries();
    expect(entry).toMatchObject({
      id: '/firecall/fc1/files/uuid-a.txt',
      type: UPLOAD_QUEUE_TYPE,
      kind: 'upload',
      label: 'a.txt',
    });
    expect((entry.payload as { blob: Blob }).blob).toBe(blob);
  });

  it('lädt beim Abarbeiten hoch und schreibt erst danach die Referenz ins Dokument', async () => {
    const order: string[] = [];
    const upload = vi.fn(async () => {
      order.push('upload');
      return 'gs://bucket/firecall/fc1/files/uuid-a.txt';
    });
    const attach = vi.fn(() => {
      order.push('attach');
    });
    registerUploadHandler(createUploadHandler({ upload, attach }));

    await queueUpload({
      storagePath: '/firecall/fc1/files/uuid-a.txt',
      blob: new Blob(['abc']),
      contentType: 'text/plain',
      fileName: 'a.txt',
      target,
    });
    expect(upload).not.toHaveBeenCalled();

    offline.value = false;
    await processQueue();

    expect(upload).toHaveBeenCalledWith(
      '/firecall/fc1/files/uuid-a.txt',
      expect.any(Blob),
      'text/plain',
    );
    expect(attach).toHaveBeenCalledWith(
      target,
      'gs://bucket/firecall/fc1/files/uuid-a.txt',
    );
    expect(order).toEqual(['upload', 'attach']);
    expect(await getQueuedEntries()).toHaveLength(0);
  });

  it('schreibt keine Referenz, wenn der Upload scheitert', async () => {
    const attach = vi.fn();
    registerUploadHandler(
      createUploadHandler({
        upload: async () => {
          offline.value = true;
          throw new Error('network');
        },
        attach,
      }),
    );
    await queueUpload({
      storagePath: 'p',
      blob: new Blob(['x']),
      fileName: 'x',
      target,
    });
    offline.value = false;
    await processQueue();

    expect(attach).not.toHaveBeenCalled();
    expect(await getQueuedEntries()).toHaveLength(1);
  });

  it('filtert die wartenden Uploads eines Ziels', async () => {
    await queueUpload({ storagePath: 'a', blob: new Blob(['a']), fileName: 'a', target });
    await queueUpload({
      storagePath: 'b',
      blob: new Blob(['b']),
      fileName: 'b',
      target: { docPath: 'call/other', field: 'attachments' },
    });

    const pending = filterPendingUploads(getQueueSnapshot(), target);
    expect(pending.map((p) => p.fileName)).toEqual(['a']);
  });
});
