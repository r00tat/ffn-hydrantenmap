import { afterEach, describe, expect, it, vi } from 'vitest';

const waitMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('firebase/firestore', () => ({
  waitForPendingWrites: waitMock,
}));
vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));

import { getPendingWriteCount } from './pendingWrites';
import {
  trackPersistedPendingWrites,
  waitForFirestoreSync,
} from './firestoreSync';

describe('waitForFirestoreSync', () => {
  afterEach(() => {
    vi.useRealTimers();
    waitMock.mockReset();
  });

  it('liefert true, sobald die Schreibvorgänge übertragen sind', async () => {
    waitMock.mockResolvedValue(undefined);
    await expect(waitForFirestoreSync()).resolves.toBe(true);
  });

  it('liefert false nach Ablauf der Zeitgrenze', async () => {
    vi.useFakeTimers();
    waitMock.mockReturnValue(new Promise(() => {}));
    const result = waitForFirestoreSync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe(false);
  });

  it('liefert false, wenn das Warten scheitert', async () => {
    waitMock.mockRejectedValue(new Error('user changed'));
    await expect(waitForFirestoreSync()).resolves.toBe(false);
  });

  it('zählt die aus einem früheren Lauf offenen Schreibvorgänge mit', async () => {
    let resolve: () => void = () => {};
    waitMock.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    trackPersistedPendingWrites();
    expect(getPendingWriteCount()).toBe(1);

    resolve();
    await vi.waitFor(() => expect(getPendingWriteCount()).toBe(0));
  });

  it('fällt beim Scheitern des Wartens auf 0 zurück, ohne unbehandelte Ablehnung', async () => {
    waitMock.mockRejectedValue(new Error('user changed'));
    trackPersistedPendingWrites();
    await vi.waitFor(() => expect(getPendingWriteCount()).toBe(0));
  });
});
