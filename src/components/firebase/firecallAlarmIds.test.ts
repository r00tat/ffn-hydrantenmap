import { describe, it, expect } from 'vitest';
import { firecallAlarmIds } from './firestore';
import type { Firecall } from './firestore';

describe('firecallAlarmIds', () => {
  it('returns the array when blaulichtSmsAlarmIds is set', () => {
    const fc = { name: 'x', blaulichtSmsAlarmIds: ['a', 'b'] } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['a', 'b']);
  });

  it('falls back to the legacy scalar when only blaulichtSmsAlarmId is set', () => {
    const fc = { name: 'x', blaulichtSmsAlarmId: 'legacy' } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['legacy']);
  });

  it('returns an empty array when neither field is set', () => {
    const fc = { name: 'x' } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual([]);
  });

  it('prefers the array even if the scalar is also present', () => {
    const fc = {
      name: 'x',
      blaulichtSmsAlarmId: 'legacy',
      blaulichtSmsAlarmIds: ['a', 'b'],
    } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['a', 'b']);
  });

  it('falls back to the legacy scalar when blaulichtSmsAlarmIds is an empty array', () => {
    const fc = {
      name: 'x',
      blaulichtSmsAlarmId: 'legacy',
      blaulichtSmsAlarmIds: [],
    } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['legacy']);
  });
});
