import { describe, it, expect } from 'vitest';
import { pushAndPrune, RadiacodeSample } from './history';

const s = (t: number, rate = 0.1): RadiacodeSample => ({
  t,
  dosisleistung: rate,
  cps: 1,
});

describe('pushAndPrune', () => {
  it('adds a sample to an empty buffer', () => {
    const out = pushAndPrune([], s(1000), 1000);
    expect(out).toEqual([s(1000)]);
  });

  it('appends while within window', () => {
    const out = pushAndPrune([s(1000)], s(2000), 2000);
    expect(out).toEqual([s(1000), s(2000)]);
  });

  it('drops samples older than windowMs', () => {
    const windowMs = 1000;
    const buf = [s(100), s(500), s(900)];
    const out = pushAndPrune(buf, s(2000), 2000, windowMs);
    expect(out).toEqual([s(2000)]);
  });

  it('keeps samples exactly at window boundary', () => {
    const out = pushAndPrune([s(1000)], s(2000), 2000, 1000);
    expect(out.map((x) => x.t)).toEqual([1000, 2000]);
  });

  it('keeps future-dated samples (clock skew tolerance)', () => {
    const out = pushAndPrune([], s(10_000), 1000, 5000);
    expect(out).toEqual([s(10_000)]);
  });
});
