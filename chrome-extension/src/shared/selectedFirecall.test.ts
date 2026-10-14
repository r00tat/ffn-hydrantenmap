import { describe, expect, it, vi } from 'vitest';
import { loadSelectedFirecall } from './selectedFirecall';

function permissionDenied() {
  return Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });
}

describe('loadSelectedFirecall', () => {
  it('returns the firecall when it is readable', async () => {
    const clear = vi.fn();
    const result = await loadSelectedFirecall(
      async () => ({ firecall: { id: 'a' } }),
      clear,
    );

    expect(result).toEqual({ firecall: { id: 'a' } });
    expect(clear).not.toHaveBeenCalled();
  });

  it('drops a selection the signed-in user may not read', async () => {
    // Stored by another account, or the firecall was deleted.
    const clear = vi.fn(async () => {});
    const result = await loadSelectedFirecall(async () => {
      throw permissionDenied();
    }, clear);

    expect(result).toEqual({ firecall: null });
    expect(clear).toHaveBeenCalledOnce();
  });

  it('keeps the selection and rethrows other errors', async () => {
    const clear = vi.fn();
    const unavailable = Object.assign(new Error('offline'), {
      code: 'unavailable',
    });

    await expect(
      loadSelectedFirecall(async () => {
        throw unavailable;
      }, clear),
    ).rejects.toBe(unavailable);
    expect(clear).not.toHaveBeenCalled();
  });
});
