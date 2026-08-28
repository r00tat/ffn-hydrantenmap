import { describe, expect, it, vi } from 'vitest';
import { mapWithConcurrency } from './promise';

/** Ein Versprechen, das erst auf Zuruf fertig wird. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('mapWithConcurrency', () => {
  it('keeps the order of the results', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);

    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('passes the index along', async () => {
    const result = await mapWithConcurrency(['a', 'b'], 1, async (v, i) => `${i}${v}`);

    expect(result).toEqual(['0a', '1b']);
  });

  it('never runs more than the limit at once', async () => {
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    let running = 0;
    let peak = 0;

    const pending = mapWithConcurrency(gates, 2, async (gate) => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
      return null;
    });

    // Zwei laufen, die übrigen warten.
    await Promise.resolve();
    expect(peak).toBe(2);

    gates.forEach((gate) => gate.resolve());
    await pending;

    expect(peak).toBe(2);
  });

  it('starts the next task as soon as a slot frees up', async () => {
    const started: number[] = [];
    const gates = Array.from({ length: 3 }, () => deferred<void>());

    const pending = mapWithConcurrency(gates, 1, async (gate, index) => {
      started.push(index);
      await gate.promise;
      return index;
    });

    await Promise.resolve();
    expect(started).toEqual([0]);

    gates[0].resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual([0, 1]);

    gates[1].resolve();
    gates[2].resolve();
    await pending;
    expect(started).toEqual([0, 1, 2]);
  });

  it('rejects when a task rejects', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      })
    ).rejects.toThrow('boom');
  });

  it('handles an empty list', async () => {
    const fn = vi.fn();

    await expect(mapWithConcurrency([], 3, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('treats a limit below one as one', async () => {
    const result = await mapWithConcurrency([1, 2], 0, async (n) => n);

    expect(result).toEqual([1, 2]);
  });
});
