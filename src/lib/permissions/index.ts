import { Capacitor } from '@capacitor/core';
import { AppPermissions, PermissionType } from './AppPermissions';
import { triggerSettingsDialog } from './settingsDialog';

export type { PermissionType, PermissionState } from './AppPermissions';
export { AppPermissions } from './AppPermissions';
export { subscribeSettingsDialog } from './settingsDialog';

const MESSAGES: Record<PermissionType, string> = {
  location:
    'Der Standortzugriff wurde dauerhaft abgelehnt. Bitte aktiviere ihn in den App-Einstellungen, um deinen Standort auf der Karte anzuzeigen.',
  bluetooth:
    'Der Bluetooth-Zugriff wurde dauerhaft abgelehnt. Bitte aktiviere ihn in den App-Einstellungen, um Radiacode-Geräte verbinden zu können.',
  notifications:
    'Der Mitteilungs-Zugriff wurde dauerhaft abgelehnt. Bitte aktiviere ihn in den App-Einstellungen, damit die Radiacode-Aufzeichnung im Hintergrund laufen kann.',
};

async function ensure(type: PermissionType): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  const checked = await AppPermissions.checkPermission({ type });
  if (checked.state === 'granted') return true;
  if (checked.state === 'permanentlyDenied') {
    triggerSettingsDialog({ type, message: MESSAGES[type] });
    return false;
  }

  const requested = await AppPermissions.requestPermission({ type });
  if (requested.state === 'granted') return true;
  if (requested.state === 'permanentlyDenied') {
    triggerSettingsDialog({ type, message: MESSAGES[type] });
    return false;
  }
  return false;
}

export const ensureLocation = (): Promise<boolean> => ensure('location');
export const ensureBluetooth = (): Promise<boolean> => ensure('bluetooth');
export const ensureNotifications = (): Promise<boolean> => ensure('notifications');

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await AppPermissions.openAppSettings();
}
