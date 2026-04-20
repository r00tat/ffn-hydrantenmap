import { BleAdapter } from './bleAdapter';

export const webAdapter: BleAdapter = {
  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  },
  async requestDevice() {
    throw new Error('webAdapter.requestDevice not implemented');
  },
  async connect() {
    throw new Error('webAdapter.connect not implemented');
  },
  async disconnect() {
    throw new Error('webAdapter.disconnect not implemented');
  },
  async onNotification() {
    throw new Error('webAdapter.onNotification not implemented');
  },
  async write() {
    throw new Error('webAdapter.write not implemented');
  },
};
