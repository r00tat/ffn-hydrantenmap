import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFirebaseConfig } from './firebaseConfig';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseFirebaseConfig', () => {
  it('returns the parsed configuration', () => {
    expect(
      parseFirebaseConfig('{"apiKey":"abc","projectId":"ffn-utils"}'),
    ).toEqual({ apiKey: 'abc', projectId: 'ffn-utils' });
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '  '],
    ['an empty object', '{}'],
  ])('returns undefined for %s', (_name, raw) => {
    expect(parseFirebaseConfig(raw)).toBeUndefined();
  });

  it('returns undefined for a configuration without an apiKey', () => {
    expect(parseFirebaseConfig('{"projectId":"ffn-utils"}')).toBeUndefined();
  });

  it('returns undefined instead of throwing on invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(parseFirebaseConfig('not json')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('returns undefined when the JSON is not an object', () => {
    expect(parseFirebaseConfig('"abc"')).toBeUndefined();
    expect(parseFirebaseConfig('null')).toBeUndefined();
    expect(parseFirebaseConfig('[]')).toBeUndefined();
  });
});
