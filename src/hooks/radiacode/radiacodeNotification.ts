import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type NotificationState = 'connected' | 'recording' | 'reconnecting';

export interface RadiacodeNotificationUpdate {
  dosisleistung: number;
  cps: number;
  state: NotificationState;
}

export interface RadiacodeNotificationPlugin {
  start(opts: { title: string; body: string }): Promise<void>;
  update(opts: RadiacodeNotificationUpdate): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'disconnectRequested',
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}

export const RadiacodeNotification =
  registerPlugin<RadiacodeNotificationPlugin>('RadiacodeNotification');
