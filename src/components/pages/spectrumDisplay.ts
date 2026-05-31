/**
 * Display helpers for gamma spectra.
 *
 * RadiaCode devices accumulate every event above the calibrated energy range
 * in the final channel (the "overflow bin"). It carries no spectroscopic
 * information and shows up as a single huge spike at the very right edge of
 * the spectrum. These helpers keep that channel out of the *displayed* data
 * (the raw/stored counts are left untouched).
 */

/**
 * Return an aligned channel array without its trailing overflow bin.
 * Arrays of length ≤ 1 are returned unchanged (nothing safe to drop).
 */
export function dropOverflowBin<T>(arr: T[]): T[] {
  return arr.length > 1 ? arr.slice(0, -1) : arr;
}

/**
 * Exclusive upper bound (≈ display length) across one or more spectra: the
 * highest channel with counts > 0 plus `padding`, ignoring the overflow bin in
 * the last channel. Suitable for `Array.slice(0, n)` and as an energy-axis
 * length. Returns 0 for empty input.
 */
export function getDisplayRange(
  countsArrays: number[][],
  padding = 20,
): number {
  let maxIndex = 0;
  let maxLen = 0;
  for (const counts of countsArrays) {
    maxLen = Math.max(maxLen, counts.length);
    // Start at length-2 so the overflow bin (last channel) never sets the
    // range, even when it is the only non-zero channel near the end.
    for (let i = counts.length - 2; i >= 0; i--) {
      if (counts[i] > 0) {
        maxIndex = Math.max(maxIndex, i);
        break;
      }
    }
  }
  // Clamp to maxLen-1 so the padding can never re-include the overflow bin.
  return Math.min(maxIndex + padding, Math.max(maxLen - 1, 0));
}
