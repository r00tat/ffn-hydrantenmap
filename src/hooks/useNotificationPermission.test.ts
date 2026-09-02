// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatformMock = vi.hoisted(() => vi.fn(() => false));
const checkPermissionMock = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock },
}));

vi.mock('../lib/permissions', () => ({
  AppPermissions: { checkPermission: checkPermissionMock },
}));

import useNotificationPermission, {
  __resetNotificationErlaubnis,
  leseErlaubnis,
} from './useNotificationPermission';

interface NotificationStub {
  permission: NotificationPermission;
}

function setzeNotification(permission?: NotificationPermission) {
  if (permission === undefined) {
    Reflect.deleteProperty(globalThis, 'Notification');
    return;
  }
  (globalThis as unknown as { Notification: NotificationStub }).Notification = {
    permission,
  };
}

describe('useNotificationPermission', () => {
  beforeEach(() => {
    __resetNotificationErlaubnis();
    isNativePlatformMock.mockReturnValue(false);
    checkPermissionMock.mockReset();
    setzeNotification('default');
  });

  afterEach(() => {
    setzeNotification(undefined);
  });

  it('liest eine erteilte Erlaubnis, ohne erneut zu fragen', async () => {
    // Der Kern der Sache: Nach dem Neuladen soll nicht wieder „einschalten"
    // dastehen, wenn die Erlaubnis längst erteilt ist.
    setzeNotification('granted');
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe('granted'));
  });

  it('meldet eine abgelehnte Erlaubnis', async () => {
    setzeNotification('denied');
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe('denied'));
  });

  it('erkennt ein Gerät ohne Benachrichtigungen', async () => {
    setzeNotification(undefined);
    const { result } = renderHook(() => useNotificationPermission());
    await waitFor(() => expect(result.current).toBe('nichtMoeglich'));
  });

  it('fragt in der App das Betriebssystem und nicht die WebView', async () => {
    // In der App steht `Notification.permission` auf `default`, obwohl die App
    // die Erlaubnis hat — genau die Verwechslung, die den Hinweis wieder
    // auftauchen ließ.
    isNativePlatformMock.mockReturnValue(true);
    checkPermissionMock.mockResolvedValue({ state: 'granted' });
    expect(await leseErlaubnis()).toBe('granted');
    expect(checkPermissionMock).toHaveBeenCalledWith({
      type: 'notifications',
    });
  });

  it('behandelt in der App nur eine dauerhafte Ablehnung als „denied"', async () => {
    isNativePlatformMock.mockReturnValue(true);
    checkPermissionMock.mockResolvedValue({ state: 'denied' });
    // Ein einfaches „denied" darf erneut gefragt werden — der Knopf bleibt
    // sinnvoll.
    expect(await leseErlaubnis()).toBe('default');
    checkPermissionMock.mockResolvedValue({ state: 'permanentlyDenied' });
    expect(await leseErlaubnis()).toBe('denied');
  });
});
