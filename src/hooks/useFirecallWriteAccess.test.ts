// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginStatus } from './auth/types';

const loginStatus = vi.fn<() => Partial<LoginStatus>>(() => ({}));

vi.mock('./useFirebaseLogin', () => ({
  default: () => loginStatus(),
}));

const { default: useFirecallWriteAccess, useIsReadOnlyFirecallGuest } =
  await import('./useFirecallWriteAccess');

describe('useFirecallWriteAccess', () => {
  beforeEach(() => {
    loginStatus.mockReturnValue({});
  });

  it('allows writing for regular users without a firecall claim', () => {
    const { result } = renderHook(() => useFirecallWriteAccess());
    expect(result.current).toBe(true);
  });

  it('allows writing for guests with write access', () => {
    loginStatus.mockReturnValue({ firecall: 'abc', firecallWrite: true });
    const { result } = renderHook(() => useFirecallWriteAccess());
    expect(result.current).toBe(true);
  });

  it('denies writing for read-only guests', () => {
    loginStatus.mockReturnValue({ firecall: 'abc', firecallWrite: false });
    const { result } = renderHook(() => useFirecallWriteAccess());
    expect(result.current).toBe(false);
  });

  it('allows writing for guests created before the flag existed', () => {
    loginStatus.mockReturnValue({ firecall: 'abc' });
    const { result } = renderHook(() => useFirecallWriteAccess());
    expect(result.current).toBe(true);
  });

  it('ignores a stray firecallWrite flag on a non-guest', () => {
    loginStatus.mockReturnValue({ firecallWrite: false });
    const { result } = renderHook(() => useFirecallWriteAccess());
    expect(result.current).toBe(true);
  });
});

describe('useIsReadOnlyFirecallGuest', () => {
  it('is true only for guests without write access', () => {
    loginStatus.mockReturnValue({ firecall: 'abc', firecallWrite: false });
    expect(renderHook(() => useIsReadOnlyFirecallGuest()).result.current).toBe(
      true,
    );

    loginStatus.mockReturnValue({ firecall: 'abc', firecallWrite: true });
    expect(renderHook(() => useIsReadOnlyFirecallGuest()).result.current).toBe(
      false,
    );

    loginStatus.mockReturnValue({});
    expect(renderHook(() => useIsReadOnlyFirecallGuest()).result.current).toBe(
      false,
    );
  });
});
