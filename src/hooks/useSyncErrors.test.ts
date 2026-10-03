// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearSyncErrors, recordSyncError } from '../lib/syncErrors';
import useSyncErrors from './useSyncErrors';

describe('useSyncErrors', () => {
  afterEach(() => clearSyncErrors());

  it('follows the sync error store', () => {
    const { result } = renderHook(() => useSyncErrors());
    expect(result.current).toEqual([]);

    act(() => {
      recordSyncError({ kind: 'add', path: 'call/1/item/2', error: 'x' });
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].path).toBe('call/1/item/2');

    act(() => clearSyncErrors());
    expect(result.current).toEqual([]);
  });
});
