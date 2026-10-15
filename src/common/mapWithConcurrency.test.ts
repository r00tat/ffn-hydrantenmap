import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './mapWithConcurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('mapWithConcurrency', () => {
  it('keeps the order of the input', async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (n) => n * 10);
    expect(result).toEqual([30, 10, 20]);
  });

  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, () => deferred());
    const done = mapWithConcurrency(gates, 2, async (gate) => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    });
    for (const gate of gates) {
      await Promise.resolve();
      gate.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
    await done;
    expect(peak).toBe(2);
  });

  it('passes the index to the callback', async () => {
    const result = await mapWithConcurrency(['a', 'b'], 4, async (v, i) => `${v}${i}`);
    expect(result).toEqual(['a0', 'b1']);
  });

  it('rejects with the first error', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });
});
