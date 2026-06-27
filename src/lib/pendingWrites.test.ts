import { describe, expect, it, vi } from 'vitest';
import {
  getPendingWriteCount,
  subscribePendingWrites,
  trackPendingWrite,
} from './pendingWrites';

describe('pendingWrites', () => {
  it('starts with no pending writes', () => {
    expect(getPendingWriteCount()).toBe(0);
  });

  it('increments while a write is in flight and decrements when it resolves', async () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });

    const tracked = trackPendingWrite(promise);
    expect(getPendingWriteCount()).toBe(1);

    resolve();
    await tracked;
    // allow the .then(settle) microtask to run
    await Promise.resolve();
    expect(getPendingWriteCount()).toBe(0);
  });

  it('decrements when a write rejects', async () => {
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((_r, rej) => {
      reject = rej;
    });

    const tracked = trackPendingWrite(promise);
    expect(getPendingWriteCount()).toBe(1);

    reject(new Error('offline'));
    await expect(tracked).rejects.toThrow('offline');
    await Promise.resolve();
    expect(getPendingWriteCount()).toBe(0);
  });

  it('counts multiple concurrent writes', async () => {
    let resolveA!: () => void;
    let resolveB!: () => void;
    const a = trackPendingWrite(
      new Promise<void>((r) => {
        resolveA = r;
      }),
    );
    const b = trackPendingWrite(
      new Promise<void>((r) => {
        resolveB = r;
      }),
    );
    expect(getPendingWriteCount()).toBe(2);

    resolveA();
    await a;
    await Promise.resolve();
    expect(getPendingWriteCount()).toBe(1);

    resolveB();
    await b;
    await Promise.resolve();
    expect(getPendingWriteCount()).toBe(0);
  });

  it('notifies subscribers on every change and stops after unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribePendingWrites(listener);

    let resolve!: () => void;
    const tracked = trackPendingWrite(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    expect(listener).toHaveBeenLastCalledWith(1);

    resolve();
    await tracked;
    await Promise.resolve();
    expect(listener).toHaveBeenLastCalledWith(0);

    unsubscribe();
    trackPendingWrite(Promise.resolve());
    const callsAfterUnsubscribe = listener.mock.calls.length;
    await Promise.resolve();
    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe);
  });

  it('returns the original promise value', async () => {
    await expect(trackPendingWrite(Promise.resolve('ref'))).resolves.toBe(
      'ref',
    );
  });
});
