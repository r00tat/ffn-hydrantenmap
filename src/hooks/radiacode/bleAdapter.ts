import { Capacitor } from '@capacitor/core';
import { NotificationState } from './radiacodeNotification';
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
  onDisconnect?(deviceId: string, handler: () => void): Unsubscribe;
  onConnectionStateChange?(
    handler: (state: 'connected' | 'disconnected' | 'reconnecting') => void,
  ): Unsubscribe;
  startForegroundService?(opts: { title: string; body: string }): Promise<void>;
  updateForegroundService?(opts: {
    dosisleistung: number;
    cps: number;
    state: NotificationState;
  }): Promise<void>;
  stopForegroundService?(): Promise<void>;
  onDisconnectRequested?(handler: () => void): Unsubscribe;
}

export async function getBleAdapter(): Promise<BleAdapter> {
  const win = typeof window !== 'undefined' ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }) : undefined;
  const isNative =
    win?.Capacitor?.isNativePlatform?.() === true ||
    Capacitor.isNativePlatform();
  if (isNative) {
    return (await import('./bleAdapter.capacitor')).capacitorAdapter;
  }
  return (await import('./bleAdapter.web')).webAdapter;
}
