// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/einsatz/AAAAAAAAAAAAAAAAAAAA/einsaetze',
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

import useFirecallNavigate from './useFirecallNavigate';

beforeEach(() => {
  mocks.pathname = '/einsatz/AAAAAAAAAAAAAAAAAAAA/einsaetze';
  mocks.push.mockReset();
  vi.spyOn(window.history, 'pushState');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFirecallNavigate', () => {
  it('wechselt aus der Einsatzliste ohne Router zu einem anderen Einsatz', () => {
    const { result } = renderHook(() => useFirecallNavigate());
    result.current('/einsatz/BBBBBBBBBBBBBBBBBBBB');
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', '/einsatz/BBBBBBBBBBBBBBBBBBBB');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('nimmt außerhalb der Einsatzseiten den Router', () => {
    mocks.pathname = '/einsaetze';
    const { result } = renderHook(() => useFirecallNavigate());
    result.current('/einsatz/BBBBBBBBBBBBBBBBBBBB');
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith('/einsatz/BBBBBBBBBBBBBBBBBBBB');
  });
});
