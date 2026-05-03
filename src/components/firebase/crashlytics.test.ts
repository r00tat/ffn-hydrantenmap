// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  recordExceptionMock,
  setCustomKeyMock,
  setUserIdMock,
  logMock,
} = vi.hoisted(() => ({
  recordExceptionMock: vi.fn(() => Promise.resolve()),
  setCustomKeyMock: vi.fn(() => Promise.resolve()),
  setUserIdMock: vi.fn(() => Promise.resolve()),
  logMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('@capacitor-firebase/crashlytics', () => ({
  FirebaseCrashlytics: {
    recordException: recordExceptionMock,
    setCustomKey: setCustomKeyMock,
    setUserId: setUserIdMock,
    log: logMock,
  },
}));

import {
  recordError,
  logCrashlyticsMessage,
  setCrashlyticsUserId,
} from './crashlytics';

describe('crashlytics wrapper', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    recordExceptionMock.mockClear();
    recordExceptionMock.mockImplementation(() => Promise.resolve());
    setCustomKeyMock.mockClear();
    setCustomKeyMock.mockImplementation(() => Promise.resolve());
    setUserIdMock.mockClear();
    setUserIdMock.mockImplementation(() => Promise.resolve());
    logMock.mockClear();
    logMock.mockImplementation(() => Promise.resolve());
    consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('recordError', () => {
    it('forwards an Error with message and structured stack frames', async () => {
      const err = new Error('boom');
      await recordError(err);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(recordExceptionMock).toHaveBeenCalledTimes(1);
      const firstCall = recordExceptionMock.mock.calls[0] as unknown as [
        {
          message: string;
          stacktrace?: Array<{
            fileName?: string;
            functionName?: string;
            lineNumber?: number;
            columnNumber?: number;
          }>;
        },
      ];
      const args = firstCall[0];
      expect(args.message).toBe('boom');
      expect(args.stacktrace).toBeTruthy();
      expect(Array.isArray(args.stacktrace)).toBe(true);
      // At least one parsed frame should have a numeric line number — proves we
      // parsed structured fields rather than dumping the raw line into functionName.
      const hasStructured = args.stacktrace?.some(
        (f) => typeof f.lineNumber === 'number' && !Number.isNaN(f.lineNumber),
      );
      expect(hasStructured).toBe(true);
    });

    it('accepts a plain string error', async () => {
      await recordError('plain string');

      expect(recordExceptionMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'plain string' }),
      );
    });

    it('accepts an arbitrary object via String(...)', async () => {
      await recordError({ weird: 1 });

      expect(recordExceptionMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('object') }),
      );
    });

    it('sets custom keys with correct types', async () => {
      const err = new Error('with-context');
      await recordError(err, { route: '/x', count: 3, isAdmin: true });

      expect(setCustomKeyMock).toHaveBeenCalledTimes(3);
      expect(setCustomKeyMock).toHaveBeenCalledWith({
        key: 'route',
        value: '/x',
        type: 'string',
      });
      expect(setCustomKeyMock).toHaveBeenCalledWith({
        key: 'count',
        value: 3,
        type: 'long',
      });
      expect(setCustomKeyMock).toHaveBeenCalledWith({
        key: 'isAdmin',
        value: true,
        type: 'boolean',
      });
    });

    it('does not throw when recordException rejects', async () => {
      recordExceptionMock.mockImplementationOnce(() =>
        Promise.reject(new Error('plugin-fail')),
      );

      await expect(recordError(new Error('still ok'))).resolves.toBeUndefined();
    });

    it('does not throw when a single setCustomKey rejects', async () => {
      setCustomKeyMock.mockImplementationOnce(() =>
        Promise.reject(new Error('bad-key')),
      );

      await expect(
        recordError(new Error('with bad key'), { route: '/x', count: 3 }),
      ).resolves.toBeUndefined();

      expect(recordExceptionMock).toHaveBeenCalled();
    });
  });

  describe('logCrashlyticsMessage', () => {
    it('forwards messages to FirebaseCrashlytics.log', async () => {
      await logCrashlyticsMessage('hello');
      expect(logMock).toHaveBeenCalledWith({ message: 'hello' });
    });

    it('does not throw when log rejects', async () => {
      logMock.mockImplementationOnce(() =>
        Promise.reject(new Error('log-fail')),
      );
      await expect(logCrashlyticsMessage('bad')).resolves.toBeUndefined();
    });
  });

  describe('setCrashlyticsUserId', () => {
    it('passes the user id through', async () => {
      await setCrashlyticsUserId('user-123');
      expect(setUserIdMock).toHaveBeenCalledWith({ userId: 'user-123' });
    });

    it('passes empty string for null', async () => {
      await setCrashlyticsUserId(null);
      expect(setUserIdMock).toHaveBeenCalledWith({ userId: '' });
    });

    it('does not throw when setUserId rejects', async () => {
      setUserIdMock.mockImplementationOnce(() =>
        Promise.reject(new Error('user-fail')),
      );
      await expect(setCrashlyticsUserId('x')).resolves.toBeUndefined();
    });
  });
});
