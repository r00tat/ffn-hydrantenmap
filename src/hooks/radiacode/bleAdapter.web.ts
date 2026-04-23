/// <reference types="web-bluetooth" />
import { BleAdapter, Unsubscribe } from './bleAdapter';
import { RadiacodeDeviceRef } from './types';

export const RADIACODE_SERVICE_UUID = 'e63215e5-7003-49d8-96b0-b024798fb901';
export const RADIACODE_WRITE_UUID = 'e63215e6-7003-49d8-96b0-b024798fb901';
export const RADIACODE_NOTIFY_UUID = 'e63215e7-7003-49d8-96b0-b024798fb901';

const WRITE_CHUNK_SIZE = 18;

interface DeviceEntry {
  device: BluetoothDevice;
  writeChar?: BluetoothRemoteGATTCharacteristic;
  notifyChar?: BluetoothRemoteGATTCharacteristic;
}

const devices = new Map<string, DeviceEntry>();

function toDeviceRef(device: BluetoothDevice): RadiacodeDeviceRef {
  return {
    id: device.id,
    name: device.name ?? 'Radiacode',
    serial: device.name ?? device.id,
  };
}

export const webAdapter: BleAdapter = {
  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  },

  async requestDevice() {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth nicht unterstützt in diesem Browser');
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [RADIACODE_SERVICE_UUID] }],
    });
    devices.set(device.id, { device });
    return toDeviceRef(device);
  },

  async getConnectedDevices() {
    if (!this.isSupported() || !navigator.bluetooth.getDevices) {
      return [];
    }
    const paired = await navigator.bluetooth.getDevices();
    const result: RadiacodeDeviceRef[] = [];
    for (const d of paired) {
      if (!devices.has(d.id)) {
        devices.set(d.id, { device: d });
      }
      if (d.gatt?.connected) {
        result.push(toDeviceRef(d));
      }
    }
    return result;
  },

  async connect(deviceId) {
    const entry = devices.get(deviceId);
    if (!entry) {
      throw new Error(`Gerät ${deviceId} nicht vorhanden — erst requestDevice aufrufen`);
    }

    if (entry.device.gatt?.connected && entry.writeChar && entry.notifyChar) {
      console.log('[Radiacode/bleAdapter.web] connect: Device already connected and characteristics initialized');
      return;
    }

    const server = await entry.device.gatt?.connect();
    if (!server) throw new Error('GATT-Verbindung fehlgeschlagen');
    const service = await server.getPrimaryService(RADIACODE_SERVICE_UUID);
    entry.writeChar = await service.getCharacteristic(RADIACODE_WRITE_UUID);
    entry.notifyChar = await service.getCharacteristic(RADIACODE_NOTIFY_UUID);
    await entry.notifyChar.startNotifications();
  },

  async disconnect(deviceId) {
    const entry = devices.get(deviceId);
    if (!entry) return;
    try {
      await entry.notifyChar?.stopNotifications();
    } catch {
      // notifications may already be stopped
    }
    entry.device.gatt?.disconnect();
    entry.writeChar = undefined;
    entry.notifyChar = undefined;
  },

  async onNotification(deviceId, handler): Promise<Unsubscribe> {
    const entry = devices.get(deviceId);
    if (!entry?.notifyChar) {
      throw new Error(`Gerät ${deviceId} nicht verbunden`);
    }
    const listener = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const value = target.value;
      if (!value) return;
      handler(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    };
    entry.notifyChar.addEventListener('characteristicvaluechanged', listener);
    return () => {
      entry.notifyChar?.removeEventListener('characteristicvaluechanged', listener);
    };
  },

  async write(deviceId, data) {
    const entry = devices.get(deviceId);
    if (!entry?.writeChar) {
      throw new Error(`Gerät ${deviceId} nicht verbunden`);
    }
    for (let pos = 0; pos < data.length; pos += WRITE_CHUNK_SIZE) {
      const chunk = data.slice(pos, Math.min(pos + WRITE_CHUNK_SIZE, data.length));
      await entry.writeChar.writeValueWithoutResponse(chunk);
    }
  },

  onDisconnect(deviceId, handler): Unsubscribe {
    const entry = devices.get(deviceId);
    if (!entry) {
      throw new Error(`Gerät ${deviceId} nicht vorhanden`);
    }
    const listener = () => handler();
    entry.device.addEventListener('gattserverdisconnected', listener);
    return () => {
      entry.device.removeEventListener('gattserverdisconnected', listener);
    };
  },
};
