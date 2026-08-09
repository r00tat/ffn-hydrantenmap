import { describe, expect, it } from 'vitest';
import { presetRange } from './fahrtenbuchStatsRange';

describe('presetRange', () => {
  const today = '2026-08-07';

  it('ends running periods today', () => {
    expect(presetRange('thisMonth', today)).toEqual({
      from: '2026-08-01',
      to: today,
    });
    expect(presetRange('thisQuarter', today)).toEqual({
      from: '2026-07-01',
      to: today,
    });
    expect(presetRange('thisYear', today)).toEqual({
      from: '2026-01-01',
      to: today,
    });
  });

  it('covers finished periods completely', () => {
    expect(presetRange('lastMonth', today)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(presetRange('lastYear', today)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('crosses the year boundary of the previous month', () => {
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('counts 30 days including today', () => {
    expect(presetRange('last30Days', today)).toEqual({
      from: '2026-07-09',
      to: today,
    });
  });

  it('starts twelve months back on the first of the month', () => {
    expect(presetRange('last12Months', today)).toEqual({
      from: '2025-09-01',
      to: today,
    });
    expect(presetRange('last12Months', '2026-12-31')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(presetRange('last12Months', '2026-01-05')).toEqual({
      from: '2025-02-01',
      to: '2026-01-05',
    });
  });

  it('leaves a custom range to the user', () => {
    expect(presetRange('custom', today)).toBeUndefined();
  });

  it('ignores a malformed day', () => {
    expect(presetRange('thisMonth', 'heute')).toBeUndefined();
  });
});
