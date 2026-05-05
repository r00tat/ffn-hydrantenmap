import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  registerPlugin: vi.fn(() => ({
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    openAppSettings: vi.fn(),
  })),
}));

import { Capacitor } from '@capacitor/core';
import { AppPermissions } from './AppPermissions';
import {
  ensureBluetooth,
  ensureLocation,
  ensureNotifications,
} from './index';
import { subscribeSettingsDialog } from './settingsDialog';

const isNative = Capacitor.isNativePlatform as unknown as ReturnType<typeof vi.fn>;
const check = AppPermissions.checkPermission as unknown as ReturnType<typeof vi.fn>;
const request = AppPermissions.requestPermission as unknown as ReturnType<typeof vi.fn>;

describe('ensureLocation/Bluetooth/Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true on web without calling plugin', async () => {
    isNative.mockReturnValue(false);
    expect(await ensureLocation()).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it('returns true when already granted', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'granted' });
    expect(await ensureBluetooth()).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('opens settings dialog when permanently denied (check)', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'permanentlyDenied' });
    const listener = vi.fn();
    subscribeSettingsDialog(listener);
    expect(await ensureNotifications()).toBe(false);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notifications' })
    );
  });

  it('requests when prompt, returns true on grant', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'prompt' });
    request.mockResolvedValue({ state: 'granted' });
    expect(await ensureLocation()).toBe(true);
    expect(request).toHaveBeenCalledWith({ type: 'location' });
  });

  it('opens settings dialog when permanently denied after request', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'denied' });
    request.mockResolvedValue({ state: 'permanentlyDenied' });
    const listener = vi.fn();
    subscribeSettingsDialog(listener);
    expect(await ensureBluetooth()).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('returns false on plain denied', async () => {
    isNative.mockReturnValue(true);
    check.mockResolvedValue({ state: 'denied' });
    request.mockResolvedValue({ state: 'denied' });
    const listener = vi.fn();
    subscribeSettingsDialog(listener);
    expect(await ensureLocation()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
