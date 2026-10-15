import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('../hooks/auth/ensureFreshAuth', () => ({ ensureFreshAuth: vi.fn() }));
vi.mock('./connectivity', () => ({ checkConnectivityNow: vi.fn() }));
vi.mock('./offlineQueue', () => ({ processQueue: vi.fn() }));

import { retrySyncNow, type SyncRetryDeps } from './syncRetry';

function deps(overrides: Partial<SyncRetryDeps> = {}): SyncRetryDeps {
  return {
    checkConnectivity: vi.fn(async () => true),
    refreshAuth: vi.fn(async () => true),
    restartFirestore: vi.fn(async () => {}),
    processQueue: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('retrySyncNow', () => {
  it('stops after the ping when the server is not reachable', async () => {
    const d = deps({ checkConnectivity: vi.fn(async () => false) });
    await expect(retrySyncNow(d)).resolves.toBe('offline');
    expect(d.refreshAuth).not.toHaveBeenCalled();
    expect(d.restartFirestore).not.toHaveBeenCalled();
  });

  it('refreshes the login before Firestore reconnects', async () => {
    const order: string[] = [];
    const d = deps({
      refreshAuth: vi.fn(async () => {
        order.push('auth');
        return true;
      }),
      restartFirestore: vi.fn(async () => {
        order.push('firestore');
      }),
      processQueue: vi.fn(async () => {
        order.push('queue');
      }),
    });
    await expect(retrySyncNow(d)).resolves.toBe('retried');
    expect(order).toEqual(['auth', 'firestore', 'queue']);
  });

  it('still reconnects Firestore when the login refresh fails', async () => {
    const d = deps({
      refreshAuth: vi.fn(async () => {
        throw new Error('server action failed');
      }),
    });
    await expect(retrySyncNow(d)).resolves.toBe('retried');
    expect(d.restartFirestore).toHaveBeenCalledTimes(1);
    expect(d.processQueue).toHaveBeenCalledTimes(1);
  });

  it('shares one run between quick repeated taps', async () => {
    let release!: () => void;
    const d = deps({
      restartFirestore: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    });
    const first = retrySyncNow(d);
    const second = retrySyncNow(d);
    await vi.waitFor(() => expect(d.restartFirestore).toHaveBeenCalled());
    release();
    await Promise.all([first, second]);
    expect(d.checkConnectivity).toHaveBeenCalledTimes(1);
    expect(d.restartFirestore).toHaveBeenCalledTimes(1);
  });
});
