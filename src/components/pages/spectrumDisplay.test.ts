import { describe, expect, it } from 'vitest';
import { dropOverflowBin, getDisplayRange } from './spectrumDisplay';

/** Build a 1024-channel spectrum: real counts up to `lastReal`, then a huge
 *  spike in the final (overflow) channel. */
function spectrumWithOverflow(lastReal: number, length = 1024): number[] {
  const counts = new Array<number>(length).fill(0);
  for (let i = 0; i <= lastReal; i++) counts[i] = 100;
  counts[length - 1] = 50250; // overflow bin
  return counts;
}

describe('dropOverflowBin', () => {
  it('drops the trailing overflow bin', () => {
    expect(dropOverflowBin([1, 2, 3])).toEqual([1, 2]);
  });

  it('leaves arrays of length <= 1 unchanged', () => {
    expect(dropOverflowBin([5])).toEqual([5]);
    expect(dropOverflowBin([])).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3];
    dropOverflowBin(input);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('getDisplayRange', () => {
  it('returns 0 for empty input', () => {
    expect(getDisplayRange([])).toBe(0);
  });

  it('ignores the overflow bin when real data ends well before it', () => {
    // Real data to channel 50, spike at 1023 → 50 + 20 padding = 70.
    expect(getDisplayRange([spectrumWithOverflow(50)])).toBe(70);
  });

  it('never re-includes the overflow bin even when padding reaches the end', () => {
    // Real data to channel 1010 → 1010 + 20 = 1030, clamped to 1023 so
    // Array.slice(0, 1023) excludes the overflow bin at index 1023.
    expect(getDisplayRange([spectrumWithOverflow(1010)])).toBe(1023);
  });

  it('falls back to padding only when nothing but the overflow bin is set', () => {
    const counts = new Array<number>(1024).fill(0);
    counts[1023] = 50250;
    expect(getDisplayRange([counts])).toBe(20);
  });

  it('uses the maximum extent across multiple spectra', () => {
    expect(
      getDisplayRange([spectrumWithOverflow(40), spectrumWithOverflow(120)]),
    ).toBe(140);
  });

  it('respects a custom padding', () => {
    expect(getDisplayRange([spectrumWithOverflow(50)], 5)).toBe(55);
  });
});
