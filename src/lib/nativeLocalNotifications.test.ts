import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitor = vi.hoisted(() => ({
  native: true,
  available: true,
  schedule: vi.fn(async () => ({})),
  cancel: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitor.native,
    isPluginAvailable: (name: string) => capacitor.available && name === 'LocalNotifications',
  },
  registerPlugin: () => ({
    schedule: capacitor.schedule,
    cancel: capacitor.cancel,
  }),
}));

import {
  isNativeLocalNotificationsAvailable,
  notificationIdFor,
  resetNativeLocalNotificationsForTests,
  syncNativeNotifications,
} from './nativeLocalNotifications';

const AT = new Date('2026-09-02T10:10:00.000Z');

describe('nativeLocalNotifications', () => {
  beforeEach(() => {
    capacitor.native = true;
    capacitor.available = true;
    capacitor.schedule.mockClear();
    capacitor.cancel.mockClear();
    resetNativeLocalNotificationsForTests();
  });

  it('ist nur in der App mit installiertem Plugin verfügbar', () => {
    expect(isNativeLocalNotificationsAvailable()).toBe(true);
    capacitor.available = false;
    expect(isNativeLocalNotificationsAvailable()).toBe(false);
    capacitor.available = true;
    capacitor.native = false;
    expect(isNativeLocalNotificationsAvailable()).toBe(false);
  });

  it('bildet stabile, positive 31-Bit-Kennungen', () => {
    const id = notificationIdFor('asue-t1');
    expect(id).toBe(notificationIdFor('asue-t1'));
    expect(id).not.toBe(notificationIdFor('asue-t2'));
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThanOrEqual(0x7fffffff);
  });

  it('tut ohne Plugin nichts', async () => {
    capacitor.available = false;
    await syncNativeNotifications('asue', [{ key: 'asue-t1', at: AT, title: 'T', body: 'B' }]);
    expect(capacitor.schedule).not.toHaveBeenCalled();
  });

  it('plant neu nur bei Änderung und storniert, was wegfällt', async () => {
    const item = { key: 'asue-t1', at: AT, title: 'T', body: 'B', url: '/x' };
    await syncNativeNotifications('asue', [item]);
    expect(capacitor.schedule).toHaveBeenCalledTimes(1);
    const [arg] = capacitor.schedule.mock.calls[0] as unknown as [
      { notifications: Array<Record<string, unknown>> },
    ];
    expect(arg.notifications[0]).toMatchObject({
      id: notificationIdFor('asue-t1'),
      title: 'T',
      body: 'B',
      schedule: { at: AT, allowWhileIdle: true },
      extra: { url: '/x' },
    });

    // Unverändert: kein zweiter Aufruf.
    await syncNativeNotifications('asue', [item]);
    expect(capacitor.schedule).toHaveBeenCalledTimes(1);

    // Geänderter Termin: neu planen.
    await syncNativeNotifications('asue', [{ ...item, at: new Date(AT.getTime() + 60_000) }]);
    expect(capacitor.schedule).toHaveBeenCalledTimes(2);

    // Weggefallen: stornieren.
    await syncNativeNotifications('asue', []);
    expect(capacitor.cancel).toHaveBeenCalledWith({
      notifications: [{ id: notificationIdFor('asue-t1') }],
    });
  });

  it('verschluckt Fehler des Plugins', async () => {
    capacitor.schedule.mockRejectedValueOnce(new Error('no permission'));
    await expect(
      syncNativeNotifications('asue', [{ key: 'asue-t1', at: AT, title: 'T', body: 'B' }]),
    ).resolves.toBeUndefined();
  });
});
