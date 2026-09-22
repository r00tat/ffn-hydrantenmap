// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onSnapshotMock, useFirebaseLoginMock } = vi.hoisted(() => ({
  onSnapshotMock: vi.fn((..._args: unknown[]) => vi.fn()),
  useFirebaseLoginMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  onSnapshot: onSnapshotMock,
}));

vi.mock('../components/firebase/firebase', () => ({ db: {}, firestore: {} }));

vi.mock('./useFirebaseLogin', () => ({ default: useFirebaseLoginMock }));

import { useFirecallSwitcher } from './useFirecall';

beforeEach(() => {
  vi.clearAllMocks();
  useFirebaseLoginMock.mockReturnValue({
    isAuthorized: true,
    hasFirebaseUser: true,
    groups: ['ffnd'],
  });
});

describe('useFirecallSwitcher', () => {
  it('abonniert den gewaehlten Einsatz mit Firebase-Benutzer', () => {
    const { result } = renderHook(() => useFirecallSwitcher());
    act(() => {
      result.current.setFirecallId?.('einsatz-1');
    });
    expect(onSnapshotMock).toHaveBeenCalled();
  });

  it('abonniert ohne Firebase-Benutzer nicht', () => {
    // Der Einsatz kann aus der URL oder dem Speicher kommen, lange bevor der
    // Firebase-Client seinen Benutzer hat. Die Regel lehnt dann ab.
    useFirebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      hasFirebaseUser: false,
      groups: ['ffnd'],
    });
    const { result } = renderHook(() => useFirecallSwitcher());
    act(() => {
      result.current.setFirecallId?.('einsatz-1');
    });
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it('holt das Abo nach, sobald die Anmeldung steht', () => {
    useFirebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      hasFirebaseUser: false,
      groups: ['ffnd'],
    });
    const { result, rerender } = renderHook(() => useFirecallSwitcher());
    act(() => {
      result.current.setFirecallId?.('einsatz-1');
    });
    expect(onSnapshotMock).not.toHaveBeenCalled();

    useFirebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      hasFirebaseUser: true,
      groups: ['ffnd'],
    });
    rerender();
    expect(onSnapshotMock).toHaveBeenCalled();
  });

  it('faengt einen Fehler des Listeners ab, statt ihn abzuwerfen', () => {
    // Ohne Fehler-Callback wirft `onSnapshot` die Ablehnung als unbehandelte
    // Promise-Ablehnung — genau die Meldungen, die im logcat auftauchten.
    const onError = vi.fn();
    onSnapshotMock.mockImplementation((..._args: unknown[]) => {
      const err = _args[2];
      onError.mockImplementation(() => {});
      (err as (e: Error) => void)(
        Object.assign(new Error('Missing or insufficient permissions.'), {
          code: 'permission-denied',
        }),
      );
      return vi.fn();
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useFirecallSwitcher());
      expect(() =>
        act(() => {
          result.current.setFirecallId?.('einsatz-1');
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
