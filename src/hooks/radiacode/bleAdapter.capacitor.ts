import { BleClient } from '@capacitor-community/bluetooth-le';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import {
  isNativeAvailable,
  nativeConnect,
  nativeDisconnect,
  nativeWrite,
  onNativeNotification,
} from './nativeBridge';
import { RadiacodeNotification } from './radiacodeNotification';
import { RadiacodeDeviceRef } from './types';

export const RADIACODE_SERVICE_UUID = 'e63215e5-7003-49d8-96b0-b024798fb901';
export const RADIACODE_WRITE_UUID = 'e63215e6-7003-49d8-96b0-b024798fb901';
export const RADIACODE_NOTIFY_UUID = 'e63215e7-7003-49d8-96b0-b024798fb901';

const WRITE_CHUNK_SIZE = 18;

let initialized = false;
const deviceNames = new Map<string, string>();
const disconnectHandlers = new Map<string, () => void>();
const connectedDevices = new Set<string>();

async function ensureBleClient(): Promise<typeof BleClient> {
  if (!initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
  return BleClient;
}

function bytesToDataView(bytes: Uint8Array): DataView {
  const copy = new Uint8Array(bytes);
  return new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
}

function dataViewToBytes(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export const capacitorAdapter: BleAdapter = {
  isSupported() {
    return true;
  },

  async requestDevice() {
    const client = await ensureBleClient();
    const device = await client.requestDevice({
      services: [RADIACODE_SERVICE_UUID],
    });
    const name = device.name ?? 'Radiacode';
    deviceNames.set(device.deviceId, name);
    return {
      id: device.deviceId,
      name,
      serial: name,
    } satisfies RadiacodeDeviceRef;
  },

  async connect(deviceId) {
    if (isNativeAvailable()) {
      // Der native Foreground-Service übernimmt die GATT-Session exklusiv
      // (Phase 2, siehe docs/plans/2026-04-21-radiacode-native-polling.md).
      // `@capacitor-community/bluetooth-le` darf daher nicht parallel
      // connecten — sonst hält Android zwei GATT-Clients offen.
      await nativeConnect(deviceId);
      connectedDevices.add(deviceId);
      return;
    }
    const client = await ensureBleClient();
    await client.connect(deviceId, (id) => {
      const h = disconnectHandlers.get(id);
      if (h) h();
    });
    connectedDevices.add(deviceId);
  },

  async disconnect(deviceId) {
    if (isNativeAvailable()) {
      await nativeDisconnect();
      connectedDevices.delete(deviceId);
      return;
    }
    const client = await ensureBleClient();
    try {
      await client.stopNotifications(
        deviceId,
        RADIACODE_SERVICE_UUID,
        RADIACODE_NOTIFY_UUID,
      );
    } catch {
      // notifications may already be stopped
    }
    await client.disconnect(deviceId);
    connectedDevices.delete(deviceId);
  },

  async onNotification(deviceId, handler): Promise<Unsubscribe> {
    if (isNativeAvailable()) {
      // Notifications werden nativ gepusht (siehe RadiacodeForegroundService).
      return onNativeNotification((bytes) => handler(bytes));
    }
    const client = await ensureBleClient();
    await client.startNotifications(
      deviceId,
      RADIACODE_SERVICE_UUID,
      RADIACODE_NOTIFY_UUID,
      (value: DataView) => {
        handler(dataViewToBytes(value));
      },
    );
    return () => {
      client
        .stopNotifications(
          deviceId,
          RADIACODE_SERVICE_UUID,
          RADIACODE_NOTIFY_UUID,
        )
        .catch(() => {
          // ignore
        });
    };
  },

  async write(deviceId, data) {
    if (isNativeAvailable()) {
      await nativeWrite(data);
      return;
    }
    const client = await ensureBleClient();
    for (let pos = 0; pos < data.length; pos += WRITE_CHUNK_SIZE) {
      const chunk = data.slice(pos, Math.min(pos + WRITE_CHUNK_SIZE, data.length));
      await client.writeWithoutResponse(
        deviceId,
        RADIACODE_SERVICE_UUID,
        RADIACODE_WRITE_UUID,
        bytesToDataView(chunk),
      );
    }
  },

  onDisconnect(deviceId, handler): Unsubscribe {
    // Das Capacitor-Plugin akzeptiert den onDisconnect-Callback ausschliesslich
    // beim Aufruf von BleClient.connect(). Wir merken uns den Handler im
    // Modul-State; `connect()` ruft ihn dann über einen Passthrough-Wrapper auf.
    // Registrierung nach erfolgter Verbindung wird unterstützt, solange der
    // Client anschliessend erneut connect() aufruft (z.B. beim Reconnect).
    disconnectHandlers.set(deviceId, handler);
    return () => {
      const current = disconnectHandlers.get(deviceId);
      if (current === handler) {
        disconnectHandlers.delete(deviceId);
      }
    };
  },

  async startForegroundService(opts) {
    await RadiacodeNotification.start(opts);
  },

  async updateForegroundService(opts) {
    await RadiacodeNotification.update(opts);
  },

  async stopForegroundService() {
    await RadiacodeNotification.stop();
  },

  onDisconnectRequested(handler) {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    RadiacodeNotification.addListener('disconnectRequested', handler)
      .then((h) => {
        listenerHandle = h;
      })
      .catch(() => {});
    return () => {
      listenerHandle?.remove().catch(() => {});
    };
  },
};
