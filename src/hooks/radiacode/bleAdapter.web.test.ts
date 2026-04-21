import { afterEach, describe, expect, it, vi } from 'vitest';
import { webAdapter } from './bleAdapter.web';

describe('webAdapter.isSupported', () => {
  const originalNav = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNav,
      configurable: true,
    });
  });

  it('returns true when navigator.bluetooth exists', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { bluetooth: {} },
      configurable: true,
    });
    expect(webAdapter.isSupported()).toBe(true);
  });

  it('returns false when navigator.bluetooth missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    expect(webAdapter.isSupported()).toBe(false);
  });
});

describe('webAdapter.onDisconnect', () => {
  const originalNav = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNav,
      configurable: true,
    });
  });

  function makeMockDevice(id = 'device-1') {
    const listeners = new Map<string, Set<(ev: Event) => void>>();
    const device = {
      id,
      name: 'Radiacode-Test',
      addEventListener: vi.fn((type: string, cb: (ev: Event) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      }),
      removeEventListener: vi.fn((type: string, cb: (ev: Event) => void) => {
        listeners.get(type)?.delete(cb);
      }),
      dispatchEvent: (ev: Event) => {
        const cbs = listeners.get(ev.type);
        if (cbs) {
          for (const cb of cbs) cb(ev);
        }
        return true;
      },
      gatt: { connect: vi.fn() },
    };
    return { device, listeners };
  }

  it('invokes handler exactly once on gattserverdisconnected', async () => {
    const { device } = makeMockDevice('disc-1');
    const bluetooth = {
      requestDevice: vi.fn(async () => device),
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { bluetooth },
      configurable: true,
    });

    // seed the internal devices map via the public API
    await webAdapter.requestDevice();

    const handler = vi.fn();
    const unsub = webAdapter.onDisconnect!('disc-1', handler);

    device.dispatchEvent(new Event('gattserverdisconnected'));
    expect(handler).toHaveBeenCalledTimes(1);

    // second event fires again (the handler itself stays subscribed until unsub)
    device.dispatchEvent(new Event('gattserverdisconnected'));
    expect(handler).toHaveBeenCalledTimes(2);

    unsub();
    device.dispatchEvent(new Event('gattserverdisconnected'));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('removes the listener on unsubscribe', async () => {
    const { device } = makeMockDevice('disc-2');
    const bluetooth = {
      requestDevice: vi.fn(async () => device),
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { bluetooth },
      configurable: true,
    });

    await webAdapter.requestDevice();

    const handler = vi.fn();
    const unsub = webAdapter.onDisconnect!('disc-2', handler);
    unsub();

    expect(device.removeEventListener).toHaveBeenCalledWith(
      'gattserverdisconnected',
      expect.any(Function),
    );
  });

  it('throws if the device has not been registered', () => {
    expect(() =>
      webAdapter.onDisconnect!('unknown-id', () => {}),
    ).toThrow(/unknown-id/);
  });
});
