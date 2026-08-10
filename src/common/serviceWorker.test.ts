import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_SW_URL,
  SERWIST_SW_URL,
  unregisterLegacyServiceWorker,
} from './serviceWorker';

function registration(
  scriptURL: string | undefined,
  slot: 'active' | 'waiting' | 'installing' = 'active',
  unregister = vi.fn(async () => true),
) {
  return {
    active: null,
    waiting: null,
    installing: null,
    [slot]: scriptURL ? { scriptURL } : null,
    unregister,
  } as unknown as ServiceWorkerRegistration;
}

function container(registrations: ServiceWorkerRegistration[]) {
  return {
    getRegistrations: vi.fn(async () => registrations),
  } as unknown as ServiceWorkerContainer;
}

describe('unregisterLegacyServiceWorker', () => {
  it('unregisters the legacy firebase-messaging-sw.js registration', async () => {
    const unregister = vi.fn(async () => true);
    const legacy = registration(
      `https://einsatz.ffnd.at${LEGACY_SW_URL}`,
      'active',
      unregister,
    );

    await expect(
      unregisterLegacyServiceWorker(container([legacy])),
    ).resolves.toBe(1);
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('leaves the new serwist registration alone', async () => {
    const unregister = vi.fn(async () => true);
    const current = registration(
      `https://einsatz.ffnd.at${SERWIST_SW_URL}`,
      'active',
      unregister,
    );

    await expect(
      unregisterLegacyServiceWorker(container([current])),
    ).resolves.toBe(0);
    expect(unregister).not.toHaveBeenCalled();
  });

  it('also matches a legacy worker that is only waiting or installing', async () => {
    const waiting = registration(
      `https://einsatz.ffnd.at${LEGACY_SW_URL}`,
      'waiting',
    );
    const installing = registration(
      `https://einsatz.ffnd.at${LEGACY_SW_URL}`,
      'installing',
    );

    await expect(
      unregisterLegacyServiceWorker(container([waiting, installing])),
    ).resolves.toBe(2);
  });

  it('does not throw when a registration fails to unregister', async () => {
    const unregister = vi.fn(async () => {
      throw new Error('nope');
    });
    const legacy = registration(
      `https://einsatz.ffnd.at${LEGACY_SW_URL}`,
      'active',
      unregister,
    );

    await expect(
      unregisterLegacyServiceWorker(container([legacy])),
    ).resolves.toBe(0);
  });

  it('is a no-op without a service worker container', async () => {
    await expect(unregisterLegacyServiceWorker(undefined)).resolves.toBe(0);
  });
});
