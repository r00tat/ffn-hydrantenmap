// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { recordErrorMock } = vi.hoisted(() => ({
  recordErrorMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../components/firebase/crashlytics', () => ({
  recordError: recordErrorMock,
}));

import useGlobalErrorReporter from './useGlobalErrorReporter';

describe('useGlobalErrorReporter', () => {
  beforeEach(() => {
    recordErrorMock.mockClear();
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
});
