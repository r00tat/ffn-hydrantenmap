import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));
vi.mock('../../lib/permissions', () => ({
  ensureNotifications: vi.fn(),
}));
vi.mock('./firebase', () => ({ default: {} }));
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  isSupported: vi.fn(async () => false),
}));

describe('requestPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns false when the Notification API is unavailable (web)', async () => {
    const original = (globalThis as { Notification?: unknown }).Notification;
    delete (globalThis as { Notification?: unknown }).Notification;
    try {
      const { Capacitor } = await import('@capacitor/core');
      (Capacitor.isNativePlatform as ReturnType<typeof vi.fn>).mockReturnValue(
        false,
      );
      const { requestPermission } = await import('./messaging');
      await expect(requestPermission()).resolves.toBe(false);
    } finally {
      if (original !== undefined) {
        (globalThis as { Notification?: unknown }).Notification = original;
      }
    }
  });

  it('on native: delegates to ensureNotifications', async () => {
    const { Capacitor } = await import('@capacitor/core');
    const { ensureNotifications } = await import('../../lib/permissions');
    (Capacitor.isNativePlatform as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );
    (ensureNotifications as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { requestPermission } = await import('./messaging');
    const result = await requestPermission();
    expect(ensureNotifications).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
