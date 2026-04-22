export interface RadiacodeSample {
  t: number;
  dosisleistung: number;
  cps: number;
}

const DEFAULT_WINDOW_MS = 5 * 60_000;

export function pushAndPrune(
  samples: RadiacodeSample[],
  next: RadiacodeSample,
  now: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): RadiacodeSample[] {
  const cutoff = now - windowMs;
  const kept = samples.filter((s) => s.t >= cutoff);
  kept.push(next);
  return kept;
}
