import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ default: {} }));
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  isSupported: vi.fn(async () => false),
}));

describe('requestPermission', () => {
  it('returns false when the Notification API is unavailable', async () => {
    const original = (globalThis as { Notification?: unknown }).Notification;
    delete (globalThis as { Notification?: unknown }).Notification;
    try {
      const { requestPermission } = await import('./messaging');
      await expect(requestPermission()).resolves.toBe(false);
    } finally {
      if (original !== undefined) {
        (globalThis as { Notification?: unknown }).Notification = original;
      }
    }
  });
});
