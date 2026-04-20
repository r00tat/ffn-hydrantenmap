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
    const coreName = '@capacitor/core';
    const { Capacitor } = await import(/* @vite-ignore */ coreName);
    if (Capacitor.isNativePlatform()) {
      const capacitorName = './bleAdapter.capacitor';
      return (await import(/* @vite-ignore */ capacitorName)).capacitorAdapter;
    }
  } catch {
    // @capacitor/core not installed → web-only build
  }
  return (await import('./bleAdapter.web')).webAdapter;
}
