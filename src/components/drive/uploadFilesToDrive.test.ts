import { describe, expect, it, vi } from 'vitest';
import {
  UPLOAD_BATCH_SIZE,
  UPLOAD_CONCURRENCY,
  uploadFilesToDrive,
} from './uploadFilesToDrive';

function files(count: number): File[] {
  return Array.from(
    { length: count },
    (_, i) => new File(['x'], `IMG_${i}.jpg`, { type: 'image/jpeg' }),
  );
}

function sessionsFor(requests: { name: string }[]) {
  return requests.map((r) => ({ name: r.name, uploadUrl: `u/${r.name}` }));
}

describe('uploadFilesToDrive', () => {
  it('requests sessions in batches the server accepts', async () => {
    const createSessions = vi.fn(async (_id: string, reqs: { name: string }[]) =>
      sessionsFor(reqs),
    );
    const upload = vi.fn(async () => {});
    const result = await uploadFilesToDrive('fc1', files(30), {
      createSessions,
      upload,
    });
    expect(createSessions).toHaveBeenCalledTimes(Math.ceil(30 / UPLOAD_BATCH_SIZE));
    for (const call of createSessions.mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(UPLOAD_BATCH_SIZE);
    }
    expect(upload).toHaveBeenCalledTimes(30);
    expect(result).toEqual({ uploaded: 30, failed: 0 });
  });

  it('uploads with limited concurrency', async () => {
    let running = 0;
    let peak = 0;
    const upload = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
    });
    await uploadFilesToDrive('fc1', files(9), {
      createSessions: async (_id, reqs) => sessionsFor(reqs),
      upload,
    });
    expect(peak).toBeLessThanOrEqual(UPLOAD_CONCURRENCY);
  });

  it('counts failed uploads and carries on', async () => {
    const upload = vi.fn(async (url: string) => {
      if (url === 'u/IMG_1.jpg') throw new Error('upload failed with status 400');
    });
    const result = await uploadFilesToDrive('fc1', files(3), {
      createSessions: async (_id, reqs) => sessionsFor(reqs),
      upload,
    });
    expect(result).toEqual({ uploaded: 2, failed: 1 });
  });

  it('counts a batch whose sessions could not be opened as failed', async () => {
    const createSessions = vi
      .fn()
      .mockRejectedValueOnce(new Error('could not start upload'))
      .mockImplementation(async (_id: string, reqs: { name: string }[]) =>
        sessionsFor(reqs),
      );
    const result = await uploadFilesToDrive('fc1', files(UPLOAD_BATCH_SIZE + 2), {
      createSessions,
      upload: async () => {},
    });
    expect(result).toEqual({ uploaded: 2, failed: UPLOAD_BATCH_SIZE });
  });

  it('reports progress per file index, also for equal names', async () => {
    const same = [
      new File(['a'], 'image.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'image.jpg', { type: 'image/jpeg' }),
    ];
    const onProgress = vi.fn();
    await uploadFilesToDrive('fc1', same, {
      createSessions: async (_id, reqs) => sessionsFor(reqs),
      upload: async (_url, _file, progress) => progress?.(1, 1),
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith(0, 100);
    expect(onProgress).toHaveBeenCalledWith(1, 100);
  });
});
