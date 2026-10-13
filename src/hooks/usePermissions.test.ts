// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginStatus } from './auth/types';

const loginStatus = vi.fn<() => Partial<LoginStatus>>(() => ({}));

vi.mock('./useFirebaseLogin', () => ({
  default: () => loginStatus(),
}));

const { useCan, useCanAny } = await import('./usePermissions');

describe('useCan', () => {
  beforeEach(() => {
    loginStatus.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      groupRoles: { ffnd: ['kostenersatz'], ffxy: [] },
    });
  });

  it('prüft das Recht in der angegebenen Gruppe', () => {
    expect(renderHook(() => useCan('ffnd', 'kostenersatz.use')).result.current).toBe(true);
    expect(renderHook(() => useCan('ffxy', 'kostenersatz.use')).result.current).toBe(false);
  });

  it('ist ohne Gruppe falsch, solange sie noch lädt', () => {
    expect(renderHook(() => useCan(undefined, 'kostenersatz.use')).result.current).toBe(false);
  });

  it('gibt dem globalen Admin jedes Recht', () => {
    loginStatus.mockReturnValue({ isAuthorized: true, isAdmin: true });
    expect(renderHook(() => useCan('ffnd', 'gruppe.manage')).result.current).toBe(true);
  });

  it('gibt einem nicht freigeschalteten Benutzer nichts', () => {
    loginStatus.mockReturnValue({
      isAuthorized: false,
      isAdmin: true,
      groupRoles: { ffnd: ['kostenersatz'] },
    });
    expect(renderHook(() => useCan('ffnd', 'kostenersatz.use')).result.current).toBe(false);
  });
});

describe('useCanAny', () => {
  it('findet das Recht in irgendeiner Gruppe', () => {
    loginStatus.mockReturnValue({
      isAuthorized: true,
      groupRoles: { ffnd: [], ffxy: ['bekleidungswart'] },
    });
    expect(renderHook(() => useCanAny('bekleidung.read')).result.current).toBe(true);
    expect(renderHook(() => useCanAny('geraete.manage')).result.current).toBe(false);
  });

  it('ist ohne Rollen falsch', () => {
    loginStatus.mockReturnValue({ isAuthorized: true });
    expect(renderHook(() => useCanAny('bekleidung.read')).result.current).toBe(false);
  });
});
