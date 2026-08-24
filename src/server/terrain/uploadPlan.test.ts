import { describe, expect, it } from 'vitest';
import { blocksToUpload, runPooled } from './uploadPlan';

const destination = (block: string) => `terrain/v1/detail/${block}.png`;

describe('blocksToUpload', () => {
  it('lässt weg, was schon im Speicher liegt', () => {
    const plan = blocksToUpload(
      ['a', 'b', 'c'],
      new Set([destination('a'), destination('c')]),
      destination
    );
    expect(plan.upload).toEqual(['b']);
    expect(plan.skipped).toBe(2);
  });

  it('überträgt alles, wenn nichts im Speicher liegt', () => {
    const plan = blocksToUpload(['a', 'b'], new Set(), destination);
    expect(plan.upload).toEqual(['a', 'b']);
    expect(plan.skipped).toBe(0);
  });

  it('überträgt auf Wunsch auch Vorhandenes erneut', () => {
    const plan = blocksToUpload(
      ['a'],
      new Set([destination('a')]),
      destination,
      true
    );
    expect(plan.upload).toEqual(['a']);
    expect(plan.skipped).toBe(0);
  });
});

describe('runPooled', () => {
  it('arbeitet jeden Eintrag genau einmal ab', async () => {
    const seen: number[] = [];
    await runPooled([1, 2, 3, 4, 5], 2, async (value) => {
      seen.push(value);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('hält die Obergrenze ein', async () => {
    let inFlight = 0;
    let peak = 0;
    await runPooled(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
    });
    expect(peak).toBe(4);
  });

  it('bricht beim ersten Fehler ab, statt ihn zu verschlucken', async () => {
    await expect(
      runPooled([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error('Upload fehlgeschlagen');
      })
    ).rejects.toThrow('Upload fehlgeschlagen');
  });
});
