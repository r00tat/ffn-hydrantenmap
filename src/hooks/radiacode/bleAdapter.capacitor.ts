import { BleClient } from '@capacitor-community/bluetooth-le';
import { BleAdapter, Unsubscribe } from './bleAdapter';
import {
  isNativeAvailable,
  nativeConnect,
  nativeDisconnect,
  nativeExecute,
  onNativeConnectionState,
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

  async getConnectedDevices() {
    if (isNativeAvailable()) {
      if (typeof RadiacodeNotification.getState !== 'function') {
        console.warn('[Radiacode/bleAdapter.capacitor] getState not implemented on native side');
        return [];
      }
      const state = await RadiacodeNotification.getState();
      if (state.connected && state.deviceAddress) {
        const name = deviceNames.get(state.deviceAddress) ?? 'Radiacode';
        return [{
          id: state.deviceAddress,
          name,
          serial: name,
        }];
      }
      return [];
    }
    const client = await ensureBleClient();
    const result: RadiacodeDeviceRef[] = [];
    const connected = await client.getConnectedDevices([RADIACODE_SERVICE_UUID]);
    for (const d of connected) {
      const name = d.name ?? deviceNames.get(d.deviceId) ?? 'Radiacode';
      result.push({
        id: d.deviceId,
        name,
        serial: name,
      });
    }
    return result;
  },

  async connect(deviceId) {
    console.log(
      '[Radiacode/bleAdapter] connect',
      deviceId,
      'native=',
      isNativeAvailable(),
    );
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
      console.warn('[Radiacode/bleAdapter] web-disconnect fired for', id);
      const h = disconnectHandlers.get(id);
      if (h) h();
    });
    connectedDevices.add(deviceId);
  },

  async disconnect(deviceId) {
    console.log(
      '[Radiacode/bleAdapter] disconnect',
      deviceId,
      'native=',
      isNativeAvailable(),
    );
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
      // Auf dem nativen Pfad gehen Notifications nicht mehr durch — der
      // Foreground-Service verbraucht sie intern für die Wire-Level-
      // Reassembly. Der `RadiacodeClient` greift stattdessen auf
      // `adapter.execute` zurück (BleAdapter.execute). Diese Funktion bleibt
      // als no-op, damit bestehender Code, der `onNotification` für die
      // Verbindungs-Vorbereitung aufruft, nicht fehlschlägt.
      return () => {};
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
      // Auf nativem Pfad gibt es keinen reinen Write mehr — alle
      // Operationen laufen über `execute` (siehe unten). Falls jemand doch
      // `write` aufruft, schicken wir die Bytes durch und verwerfen die
      // Response, damit ältere Call-Sites nicht hängen bleiben.
      await nativeExecute(data);
      return;
    }
    const client = await ensureBleClient();
    for (let pos = 0; pos < data.length; pos += WRITE_CHUNK_SIZE) {
      const chunk = data.slice(
        pos,
        Math.min(pos + WRITE_CHUNK_SIZE, data.length),
      );
      await client.writeWithoutResponse(
        deviceId,
        RADIACODE_SERVICE_UUID,
        RADIACODE_WRITE_UUID,
        bytesToDataView(chunk),
      );
    }
  },

  async execute(deviceId, framedRequest): Promise<Uint8Array> {
    if (!isNativeAvailable()) {
      throw new Error('execute() is only supported on the native (capacitor) adapter');
    }
    return nativeExecute(framedRequest);
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

  onConnectionStateChange(handler) {
    if (isNativeAvailable()) {
      return onNativeConnectionState(handler);
    }
    return () => {};
  },
};
