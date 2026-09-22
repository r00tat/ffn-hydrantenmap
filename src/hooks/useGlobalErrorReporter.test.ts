// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { recordErrorMock, authMock } = vi.hoisted(() => ({
  recordErrorMock: vi.fn(() => Promise.resolve()),
  authMock: { currentUser: null as unknown },
}));

vi.mock('../components/firebase/crashlytics', () => ({
  recordError: recordErrorMock,
}));

vi.mock('../components/firebase/firebase', () => ({ auth: authMock }));

import useGlobalErrorReporter from './useGlobalErrorReporter';

describe('useGlobalErrorReporter', () => {
  beforeEach(() => {
    recordErrorMock.mockClear();
    authMock.currentUser = { uid: 'someone' };
    window.onerror = null;
  });

  afterEach(() => {
    window.onerror = null;
  });

  it('forwards window.onerror invocations to recordError', () => {
    renderHook(() => useGlobalErrorReporter());

    const err = new Error('boom');
    window.onerror?.('msg', 'file.js', 1, 1, err);

    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(recordErrorMock).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ source: 'window.onerror' }),
    );
  });

  it('falls back to the message when no Error object is provided', () => {
    renderHook(() => useGlobalErrorReporter());

    window.onerror?.('msg only', 'file.js', 1, 1, undefined);

    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(recordErrorMock).toHaveBeenCalledWith(
      'msg only',
      expect.objectContaining({ source: 'window.onerror' }),
    );
  });

  it('forwards unhandledrejection events to recordError', () => {
    renderHook(() => useGlobalErrorReporter());

    const reason = new Error('rejected');
    const event = new Event('unhandledrejection') as Event & {
      reason?: unknown;
    };
    event.reason = reason;
    window.dispatchEvent(event);

    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    expect(recordErrorMock).toHaveBeenCalledWith(
      reason,
      expect.objectContaining({ source: 'unhandledrejection' }),
    );
  });

  it('removes both listeners on unmount', () => {
    const { unmount } = renderHook(() => useGlobalErrorReporter());
    unmount();

    recordErrorMock.mockClear();

    window.onerror?.('msg', 'file.js', 1, 1, new Error('after'));
    const event = new Event('unhandledrejection') as Event & {
      reason?: unknown;
    };
    event.reason = new Error('after-rejection');
    window.dispatchEvent(event);

    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('preserves and chains a previously installed window.onerror', () => {
    const previous = vi.fn();
    window.onerror = previous;

    renderHook(() => useGlobalErrorReporter());

    const err = new Error('chain');
    window.onerror?.('msg', 'file.js', 5, 5, err);

    expect(previous).toHaveBeenCalledTimes(1);
    expect(recordErrorMock).toHaveBeenCalledTimes(1);
  });

  it('meldet ein permission-denied ohne angemeldeten Benutzer nicht', () => {
    // Auf dem Login-Bildschirm laeuft jede Firestore-Anfrage ohne
    // `request.auth`, und die Regeln lehnen ab — richtig so. Als Absturz
    // gezaehlt verstopft das die Crashlytics-Auswertung.
    authMock.currentUser = null;
    renderHook(() => useGlobalErrorReporter());

    const event = new Event('unhandledrejection') as Event & {
      reason?: unknown;
    };
    event.reason = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    window.dispatchEvent(event);

    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('meldet ein permission-denied mit angemeldetem Benutzer weiterhin', () => {
    // Dann ist es echt: der Benutzer ist angemeldet und darf trotzdem nicht.
    renderHook(() => useGlobalErrorReporter());

    const event = new Event('unhandledrejection') as Event & {
      reason?: unknown;
    };
    const reason = Object.assign(
      new Error('Missing or insufficient permissions.'),
      { code: 'permission-denied' }
    );
    event.reason = reason;
    window.dispatchEvent(event);

    expect(recordErrorMock).toHaveBeenCalledWith(reason, {
      source: 'unhandledrejection',
    });
  });

  it('meldet ein permission-denied aus window.onerror ebenso nicht', () => {
    authMock.currentUser = null;
    renderHook(() => useGlobalErrorReporter());

    const err = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    window.onerror?.('msg', 'file.js', 1, 1, err);

    expect(recordErrorMock).not.toHaveBeenCalled();
  });
});
