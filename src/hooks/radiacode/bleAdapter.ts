import { RadiacodeDeviceRef } from './types';

export type Unsubscribe = () => void;

export interface BleAdapter {
  isSupported(): boolean;
  requestDevice(): Promise<RadiacodeDeviceRef>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  onNotification(
    deviceId: string,
    handler: (packet: Uint8Array) => void,
  ): Promise<Unsubscribe>;
  write(deviceId: string, data: Uint8Array): Promise<void>;
  startForegroundService?(opts: { title: string; body: string }): Promise<void>;
  stopForegroundService?(): Promise<void>;
}

export async function getBleAdapter(): Promise<BleAdapter> {
  try {
    // @ts-expect-error — optional dep, only present in capacitor subproject
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      // @ts-expect-error — created in Task 21 when capacitor subproject exists
      return (await import('./bleAdapter.capacitor')).capacitorAdapter;
    }
  } catch {
    // @capacitor/core not installed → web-only build
  }
  return (await import('./bleAdapter.web')).webAdapter;
}
