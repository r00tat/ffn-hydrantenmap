// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEVICE_STORAGE_KEY,
  liveLocationDeviceId,
  liveLocationDeviceLabel,
} from './liveLocationDevice';

describe('liveLocationDeviceId', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('creates an id that the Firestore rules accept as a doc-id suffix', () => {
    expect(liveLocationDeviceId()).toMatch(/^[a-z0-9]{12}$/);
  });

  // Die Geräte-ID ist der Schlüssel des eigenen Dokuments. Wechselt sie,
  // hinterlässt jedes Teilen ein zweites Dokument, das erst die TTL wegräumt —
  // und der eigene Pin doppelt sich auf den Karten der anderen.
  it('is stable across calls and page loads', () => {
    const first = liveLocationDeviceId();
    expect(liveLocationDeviceId()).toBe(first);
    expect(window.localStorage.getItem(DEVICE_STORAGE_KEY)).toBe(first);
  });

  it('differs from another device (a fresh storage)', () => {
    const first = liveLocationDeviceId();
    window.localStorage.clear();
    expect(liveLocationDeviceId()).not.toBe(first);
  });

  it('replaces a stored value that no longer fits the format', () => {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, 'has_underscore/and slash');
    expect(liveLocationDeviceId()).toMatch(/^[a-z0-9]{12}$/);
  });
});

describe('liveLocationDeviceLabel', () => {
  it('derives the label from the browser user agent', () => {
    expect(typeof liveLocationDeviceLabel()).toBe('string');
  });
});
