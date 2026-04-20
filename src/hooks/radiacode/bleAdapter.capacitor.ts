import { BleAdapter, Unsubscribe } from './bleAdapter';
import { RadiacodeDeviceRef } from './types';

export const RADIACODE_SERVICE_UUID = 'e63215e5-7003-49d8-96b0-b024798fb901';
export const RADIACODE_WRITE_UUID = 'e63215e6-7003-49d8-96b0-b024798fb901';
export const RADIACODE_NOTIFY_UUID = 'e63215e7-7003-49d8-96b0-b024798fb901';

const WRITE_CHUNK_SIZE = 18;

let initialized = false;
const deviceNames = new Map<string, string>();

async function getBleClient(): Promise<any> {
  const modName = '@capacitor-community/bluetooth-le';
  const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ modName);
  if (!initialized) {
    await mod.BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
  return mod.BleClient;
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
    const BleClient = await getBleClient();
    const device = await BleClient.requestDevice({
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
    const BleClient = await getBleClient();
    await BleClient.connect(deviceId);
  },

  async disconnect(deviceId) {
    const BleClient = await getBleClient();
    try {
      await BleClient.stopNotifications(
        deviceId,
        RADIACODE_SERVICE_UUID,
        RADIACODE_NOTIFY_UUID,
      );
    } catch {
      // notifications may already be stopped
    }
    await BleClient.disconnect(deviceId);
  },

  async onNotification(deviceId, handler): Promise<Unsubscribe> {
    const BleClient = await getBleClient();
    await BleClient.startNotifications(
      deviceId,
      RADIACODE_SERVICE_UUID,
      RADIACODE_NOTIFY_UUID,
      (value: DataView) => {
        handler(dataViewToBytes(value));
      },
    );
    return () => {
      BleClient.stopNotifications(
        deviceId,
        RADIACODE_SERVICE_UUID,
        RADIACODE_NOTIFY_UUID,
      ).catch(() => {
        // ignore
      });
    };
  },

  async write(deviceId, data) {
    const BleClient = await getBleClient();
    for (let pos = 0; pos < data.length; pos += WRITE_CHUNK_SIZE) {
      const chunk = data.slice(pos, Math.min(pos + WRITE_CHUNK_SIZE, data.length));
      await BleClient.writeWithoutResponse(
        deviceId,
        RADIACODE_SERVICE_UUID,
        RADIACODE_WRITE_UUID,
        bytesToDataView(chunk),
      );
    }
  },

  async startForegroundService(opts) {
    try {
      const modName = './capacitorForegroundService';
      const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ modName);
      await mod.startRadiacodeService(opts);
    } catch {
      // Foreground service plugin not available — BLE continues while WebView active
    }
  },

  async stopForegroundService() {
    try {
      const modName = './capacitorForegroundService';
      const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ modName);
      await mod.stopRadiacodeService();
    } catch {
      // ignore
    }
  },
};
