import type { FirestoreError } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { waitForPendingWritesMock } = vi.hoisted(() => ({
  waitForPendingWritesMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  waitForPendingWrites: waitForPendingWritesMock,
}));

const { subscribeRetryingAfterPendingWrites } = await import('./snapshotRetry');

const firestore = { __firestore: true } as never;
const denied = Object.assign(new Error('Missing or insufficient permissions.'), {
  code: 'permission-denied',
}) as FirestoreError;

/** Ein Abonnement, dessen Fehler-Callback der Test von außen auslöst. */
function fakeSubscribe() {
  const handlers: ((err: FirestoreError) => void)[] = [];
  const unsubscribes: ReturnType<typeof vi.fn>[] = [];
  const subscribe = vi.fn((onError: (err: FirestoreError) => void) => {
    handlers.push(onError);
    const unsubscribe = vi.fn();
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  });
  return { subscribe, handlers, unsubscribes };
}

beforeEach(() => {
  vi.clearAllMocks();
  waitForPendingWritesMock.mockResolvedValue(undefined);
});

describe('subscribeRetryingAfterPendingWrites', () => {
  // Ein offline angelegter Einsatz existiert auf dem Server erst, wenn sein
  // Schreibvorgang übertragen ist. Die Regeln der Untersammlungen lesen die
  // Gruppe aber per get() am Einsatzdokument — ein Listener, der nach dem
  // Reconnect vor diesem Schreibvorgang beim Server ankommt, wird abgelehnt
  // und vom SDK beendet.
  it('subscribes again after pending writes once permission is denied', async () => {
    const { subscribe, handlers, unsubscribes } = fakeSubscribe();
    const onError = vi.fn();

    subscribeRetryingAfterPendingWrites(firestore, subscribe, onError);
    expect(subscribe).toHaveBeenCalledTimes(1);

    handlers[0](denied);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));

    expect(waitForPendingWritesMock).toHaveBeenCalledWith(firestore);
    expect(onError).not.toHaveBeenCalled();
    expect(unsubscribes[0]).not.toHaveBeenCalled();
  });

  it('waits for the pending writes before subscribing again', async () => {
    let confirm: () => void = () => {};
    waitForPendingWritesMock.mockReturnValue(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    const { subscribe, handlers } = fakeSubscribe();

    subscribeRetryingAfterPendingWrites(firestore, subscribe, vi.fn());
    handlers[0](denied);
    await Promise.resolve();
    expect(subscribe).toHaveBeenCalledTimes(1);

    confirm();
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
  });

  it('reports a second denial instead of retrying forever', async () => {
    const { subscribe, handlers } = fakeSubscribe();
    const onError = vi.fn();

    subscribeRetryingAfterPendingWrites(firestore, subscribe, onError);
    handlers[0](denied);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));

    handlers[1](denied);
    await Promise.resolve();

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(denied);
  });

  it('reports other errors right away', () => {
    const { subscribe, handlers } = fakeSubscribe();
    const onError = vi.fn();
    const unavailable = Object.assign(new Error('unavailable'), {
      code: 'unavailable',
    }) as FirestoreError;

    subscribeRetryingAfterPendingWrites(firestore, subscribe, onError);
    handlers[0](unavailable);

    expect(onError).toHaveBeenCalledWith(unavailable);
    expect(waitForPendingWritesMock).not.toHaveBeenCalled();
  });

  it('reports the denial when waiting for the writes fails', async () => {
    waitForPendingWritesMock.mockRejectedValue(new Error('user changed'));
    const { subscribe, handlers } = fakeSubscribe();
    const onError = vi.fn();

    subscribeRetryingAfterPendingWrites(firestore, subscribe, onError);
    handlers[0](denied);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(denied));
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe again after it was unsubscribed', async () => {
    let confirm: () => void = () => {};
    waitForPendingWritesMock.mockReturnValue(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    const { subscribe, handlers, unsubscribes } = fakeSubscribe();

    const unsubscribe = subscribeRetryingAfterPendingWrites(
      firestore,
      subscribe,
      vi.fn(),
    );
    handlers[0](denied);
    unsubscribe();
    confirm();
    await Promise.resolve();
    await Promise.resolve();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the retried listener', async () => {
    const { subscribe, handlers, unsubscribes } = fakeSubscribe();

    const unsubscribe = subscribeRetryingAfterPendingWrites(
      firestore,
      subscribe,
      vi.fn(),
    );
    handlers[0](denied);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));

    unsubscribe();
    expect(unsubscribes[1]).toHaveBeenCalledTimes(1);
  });
});
