import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncErrors,
  dismissSyncError,
  getSyncErrors,
  recordSyncError,
  retrySyncError,
  subscribeSyncErrors,
} from './syncErrors';

describe('syncErrors', () => {
  afterEach(() => {
    clearSyncErrors();
  });

  it('starts empty', () => {
    expect(getSyncErrors()).toEqual([]);
  });

  it('records path, kind, time and error code', () => {
    const entry = recordSyncError({
      kind: 'add',
      path: 'call/abc/item/x',
      error: Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }),
    });

    expect(entry.kind).toBe('add');
    expect(entry.path).toBe('call/abc/item/x');
    expect(entry.code).toBe('permission-denied');
    expect(entry.message).toBe('Missing or insufficient permissions.');
    expect(typeof entry.timestamp).toBe('number');
    expect(getSyncErrors()).toEqual([entry]);
  });

  it('falls back to "unknown" for errors without a code', () => {
    const entry = recordSyncError({ kind: 'set', path: 'p', error: 'boom' });
    expect(entry.code).toBe('unknown');
    expect(entry.message).toBe('boom');
  });

  it('keeps the snapshot stable until something changes', () => {
    const before = getSyncErrors();
    expect(getSyncErrors()).toBe(before);
    recordSyncError({ kind: 'set', path: 'p', error: new Error('x') });
    expect(getSyncErrors()).not.toBe(before);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncErrors(listener);
    recordSyncError({ kind: 'set', path: 'p', error: new Error('x') });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    recordSyncError({ kind: 'set', path: 'p', error: new Error('y') });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dismisses a single entry', () => {
    const a = recordSyncError({ kind: 'set', path: 'a', error: new Error('a') });
    const b = recordSyncError({ kind: 'set', path: 'b', error: new Error('b') });
    dismissSyncError(a.id);
    expect(getSyncErrors()).toEqual([b]);
  });

  it('retry removes the entry and runs the closure', () => {
    const retry = vi.fn();
    const entry = recordSyncError({
      kind: 'update',
      path: 'a',
      error: new Error('a'),
      retry,
    });
    expect(entry.canRetry).toBe(true);

    retrySyncError(entry.id);

    expect(retry).toHaveBeenCalledTimes(1);
    expect(getSyncErrors()).toEqual([]);
  });

  it('retry without closure only keeps the entry', () => {
    const entry = recordSyncError({ kind: 'delete', path: 'a', error: 'x' });
    expect(entry.canRetry).toBe(false);
    retrySyncError(entry.id);
    expect(getSyncErrors()).toHaveLength(1);
  });

  it('caps the list so a flood of rejections does not grow unbounded', () => {
    for (let i = 0; i < 120; i++) {
      recordSyncError({ kind: 'set', path: `p${i}`, error: 'x' });
    }
    const errors = getSyncErrors();
    expect(errors.length).toBe(100);
    // the newest entries are kept
    expect(errors[errors.length - 1].path).toBe('p119');
  });
});
