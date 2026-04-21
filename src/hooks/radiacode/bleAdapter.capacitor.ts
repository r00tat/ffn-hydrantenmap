import { BleClient } from '@capacitor-community/bluetooth-le';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import { RadiacodeDeviceRef } from './types';

export const RADIACODE_SERVICE_UUID = 'e63215e5-7003-49d8-96b0-b024798fb901';
export const RADIACODE_WRITE_UUID = 'e63215e6-7003-49d8-96b0-b024798fb901';
export const RADIACODE_NOTIFY_UUID = 'e63215e7-7003-49d8-96b0-b024798fb901';

const WRITE_CHUNK_SIZE = 18;

let initialized = false;
const deviceNames = new Map<string, string>();

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
    const client = await ensureBleClient();
    await client.connect(deviceId);
  },

  async disconnect(deviceId) {
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
  },

  async onNotification(deviceId, handler): Promise<Unsubscribe> {
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
};
