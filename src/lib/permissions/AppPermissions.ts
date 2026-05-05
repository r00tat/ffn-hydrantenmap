import { registerPlugin } from '@capacitor/core';

export type PermissionType = 'location' | 'notifications' | 'bluetooth';

export type PermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'permanentlyDenied';

export interface AppPermissionsPlugin {
  checkPermission(opts: { type: PermissionType }): Promise<{ state: PermissionState }>;
  requestPermission(opts: { type: PermissionType }): Promise<{ state: PermissionState }>;
  openAppSettings(): Promise<void>;
}

export const AppPermissions =
  registerPlugin<AppPermissionsPlugin>('AppPermissions');
