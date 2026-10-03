import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitor = vi.hoisted(() => ({
  native: true,
  available: true,
  exact: 'granted' as string,
  schedule: vi.fn(async (..._args: unknown[]) => ({})),
  cancel: vi.fn(async (..._args: unknown[]) => {}),
  createChannel: vi.fn(async (..._args: unknown[]) => {}),
  checkExact: vi.fn(async () => ({ exact_alarm: capacitor.exact })),
  changeExact: vi.fn(async () => ({ exact_alarm: capacitor.exact })),
  listeners: [] as Array<(action: unknown) => void>,
  remove: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitor.native,
    isPluginAvailable: (name: string) =>
      capacitor.available && name === 'LocalNotifications',
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: capacitor.schedule,
    cancel: capacitor.cancel,
    createChannel: capacitor.createChannel,
    checkExactNotificationSetting: capacitor.checkExact,
    changeExactNotificationSetting: capacitor.changeExact,
    addListener: vi.fn(
      async (_event: string, cb: (action: unknown) => void) => {
        capacitor.listeners.push(cb);
        return { remove: capacitor.remove };
      },
    ),
  },
}));

import {
  addNativeNotificationTapListener,
  getExactAlarmState,
  isNativeLocalNotificationsAvailable,
  notificationIdFor,
  refreshExactAlarmState,
  requestExactAlarms,
  resetNativeLocalNotificationsForTests,
  syncNativeNotifications,
} from './nativeLocalNotifications';

const AT = new Date('2026-09-02T10:10:00.000Z');
const CHANNEL = {
  id: 'atemschutz-warnung',
  name: 'Atemschutzwarnungen',
  description: 'Warnungen der Atemschutzüberwachung',
};

type ScheduleArg = { notifications: Array<Record<string, unknown>> };

describe('nativeLocalNotifications', () => {
  beforeEach(() => {
    capacitor.native = true;
    capacitor.available = true;
    capacitor.exact = 'granted';
    capacitor.schedule.mockClear();
    capacitor.cancel.mockClear();
    capacitor.createChannel.mockClear();
    capacitor.checkExact.mockClear();
    capacitor.changeExact.mockClear();
    capacitor.remove.mockClear();
    capacitor.listeners = [];
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
    await syncNativeNotifications(
      'asue',
      [{ key: 'asue-t1', at: AT, title: 'T', body: 'B' }],
      CHANNEL,
    );
    expect(capacitor.schedule).not.toHaveBeenCalled();
    expect(capacitor.createChannel).not.toHaveBeenCalled();
  });

  it('plant neu nur bei Änderung und storniert, was wegfällt', async () => {
    const item = { key: 'asue-t1', at: AT, title: 'T', body: 'B', url: '/x' };
    await syncNativeNotifications('asue', [item], CHANNEL);
    expect(capacitor.schedule).toHaveBeenCalledTimes(1);
    const [arg] = capacitor.schedule.mock.calls[0] as [ScheduleArg];
    expect(arg.notifications[0]).toMatchObject({
      id: notificationIdFor('asue-t1'),
      title: 'T',
      body: 'B',
      schedule: { at: AT, allowWhileIdle: true },
      extra: { url: '/x' },
      channelId: CHANNEL.id,
    });

    // Unverändert: kein zweiter Aufruf.
    await syncNativeNotifications('asue', [item], CHANNEL);
    expect(capacitor.schedule).toHaveBeenCalledTimes(1);

    // Geänderter Termin: neu planen.
    await syncNativeNotifications(
      'asue',
      [{ ...item, at: new Date(AT.getTime() + 60_000) }],
      CHANNEL,
    );
    expect(capacitor.schedule).toHaveBeenCalledTimes(2);

    // Weggefallen: stornieren.
    await syncNativeNotifications('asue', [], CHANNEL);
    expect(capacitor.cancel).toHaveBeenCalledWith({
      notifications: [{ id: notificationIdFor('asue-t1') }],
    });
  });

  it('legt den Kanal einmal an, mit höchster Wichtigkeit und auf dem Sperrbildschirm sichtbar', async () => {
    const item = { key: 'asue-t1', at: AT, title: 'T', body: 'B' };
    await syncNativeNotifications('asue', [item], CHANNEL);
    await syncNativeNotifications(
      'asue',
      [{ ...item, at: new Date(AT.getTime() + 1000) }],
      CHANNEL,
    );
    expect(capacitor.createChannel).toHaveBeenCalledTimes(1);
    expect(capacitor.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CHANNEL.id,
        name: CHANNEL.name,
        description: CHANNEL.description,
        importance: 5,
        visibility: 1,
        vibration: true,
      }),
    );
  });

  it('plant exakt, wenn exakte Alarme erlaubt sind', async () => {
    await syncNativeNotifications(
      'asue',
      [{ key: 'asue-t1', at: AT, title: 'T', body: 'B' }],
      CHANNEL,
    );
    const [arg] = capacitor.schedule.mock.calls[0] as [ScheduleArg];
    expect(arg.notifications[0].isExactNotification).toBe(true);
  });

  // Mit `isExactNotification: true` öffnet das Plugin bei fehlender Erlaubnis
  // bei *jedem* `schedule()` die Systemeinstellungen. Der Abgleich läuft im
  // Sekundentakt — ohne Erlaubnis darf deshalb nur unscharf geplant werden.
  it('plant ohne Erlaubnis unscharf, damit nicht bei jedem Abgleich die Einstellungen aufgehen', async () => {
    capacitor.exact = 'denied';
    await syncNativeNotifications(
      'asue',
      [{ key: 'asue-t1', at: AT, title: 'T', body: 'B' }],
      CHANNEL,
    );
    const [arg] = capacitor.schedule.mock.calls[0] as [ScheduleArg];
    expect(arg.notifications[0].isExactNotification).toBe(false);
    expect(capacitor.changeExact).not.toHaveBeenCalled();
  });

  it('plant nach erteilter Erlaubnis alles exakt neu', async () => {
    capacitor.exact = 'denied';
    const item = { key: 'asue-t1', at: AT, title: 'T', body: 'B' };
    await syncNativeNotifications('asue', [item], CHANNEL);
    expect(await getExactAlarmState()).toBe('denied');

    capacitor.exact = 'granted';
    expect(await requestExactAlarms()).toBe('granted');
    expect(capacitor.changeExact).toHaveBeenCalledTimes(1);

    await syncNativeNotifications('asue', [item], CHANNEL);
    expect(capacitor.schedule).toHaveBeenCalledTimes(2);
    const [arg] = capacitor.schedule.mock.calls[1] as [ScheduleArg];
    expect(arg.notifications[0].isExactNotification).toBe(true);
  });

  it('merkt eine in den Einstellungen erteilte Erlaubnis beim Nachlesen', async () => {
    capacitor.exact = 'denied';
    expect(await refreshExactAlarmState()).toBe('denied');
    capacitor.exact = 'granted';
    expect(await refreshExactAlarmState()).toBe('granted');
  });

  it('meldet ohne Plugin „nicht verfügbar“', async () => {
    capacitor.available = false;
    expect(await refreshExactAlarmState()).toBe('unavailable');
    expect(await requestExactAlarms()).toBe('unavailable');
    expect(capacitor.changeExact).not.toHaveBeenCalled();
  });

  it('verschluckt Fehler des Plugins', async () => {
    capacitor.schedule.mockRejectedValueOnce(new Error('no permission'));
    await expect(
      syncNativeNotifications(
        'asue',
        [{ key: 'asue-t1', at: AT, title: 'T', body: 'B' }],
        CHANNEL,
      ),
    ).resolves.toBeUndefined();
  });

  describe('Tipp auf die Benachrichtigung', () => {
    const tap = (extra: unknown) =>
      capacitor.listeners.forEach((cb) =>
        cb({ actionId: 'tap', notification: { id: 1, extra } }),
      );

    it('führt zur hinterlegten Seite', async () => {
      const onUrl = vi.fn();
      await addNativeNotificationTapListener(onUrl);
      tap({ url: '/atemschutzueberwachung?einsatz=abc' });
      expect(onUrl).toHaveBeenCalledWith('/atemschutzueberwachung?einsatz=abc');
    });

    it.each([
      ['fremde Adresse', { url: 'https://example.com/' }],
      ['protokollrelative Adresse', { url: '//example.com/' }],
      ['javascript-Adresse', { url: 'javascript:alert(1)' }],
      ['keine Adresse', undefined],
    ])('ignoriert %s', async (_label, extra) => {
      const onUrl = vi.fn();
      await addNativeNotificationTapListener(onUrl);
      tap(extra);
      expect(onUrl).not.toHaveBeenCalled();
    });

    it('meldet sich wieder ab', async () => {
      const remove = await addNativeNotificationTapListener(vi.fn());
      remove();
      expect(capacitor.remove).toHaveBeenCalled();
    });

    it('hängt ohne Plugin nichts ein', async () => {
      capacitor.available = false;
      const remove = await addNativeNotificationTapListener(vi.fn());
      expect(capacitor.listeners).toHaveLength(0);
      expect(() => remove()).not.toThrow();
    });
  });
});
