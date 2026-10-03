import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from './withTimeout';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('liefert das Ergebnis, wenn das Versprechen rechtzeitig erfüllt wird', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('reicht eine Ablehnung unverändert durch', async () => {
    const err = new Error('nope');
    await expect(withTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('lehnt nach Ablauf der Zeit mit TimeoutError ab', async () => {
    // Das Versprechen erfüllt sich nie — wie eine Server Action im WLAN ohne
    // Internet.
    const pending = withTimeout(new Promise<number>(() => {}), 1000, 'session');
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    await expect(pending).rejects.toThrow(/session/);
  });

  it('räumt den Timer nach dem Ergebnis ab', async () => {
    await withTimeout(Promise.resolve('ok'), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
