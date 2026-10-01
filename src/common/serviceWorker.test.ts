import { describe, expect, it, vi } from 'vitest';
import {
  isNewWorkerBuild,
  LEGACY_SW_URL,
  requestWorkerBuildId,
  SERWIST_SW_URL,
  SW_BUILD_ID_REQUEST,
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

describe('isNewWorkerBuild', () => {
  it('is false when page and worker come from the same build', () => {
    expect(isNewWorkerBuild('v1.2.3', 'v1.2.3')).toBe(false);
  });

  it('is true when the worker comes from another build', () => {
    expect(isNewWorkerBuild('v1.2.3', 'v1.2.4')).toBe(true);
  });

  it('is true when a build id is unknown', () => {
    // Ohne Vergleichswert lieber einmal zu oft melden als ein echtes Update
    // verschweigen.
    expect(isNewWorkerBuild('v1.2.3', undefined)).toBe(true);
    expect(isNewWorkerBuild('', 'v1.2.3')).toBe(true);
    expect(isNewWorkerBuild('v1.2.3', '')).toBe(true);
  });
});

describe('requestWorkerBuildId', () => {
  it('asks the worker over a message channel and returns its build id', async () => {
    const worker = {
      postMessage: vi.fn((message: unknown, transfer: MessagePort[]) => {
        expect(message).toEqual({ type: SW_BUILD_ID_REQUEST });
        transfer[0].postMessage({ buildId: 'v1.2.3' });
      }),
    } as unknown as ServiceWorker;

    await expect(requestWorkerBuildId(worker)).resolves.toBe('v1.2.3');
  });

  it('resolves undefined when the worker does not answer in time', async () => {
    const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;

    await expect(requestWorkerBuildId(worker, 10)).resolves.toBeUndefined();
  });

  it('resolves undefined without a worker', async () => {
    await expect(requestWorkerBuildId(null)).resolves.toBeUndefined();
  });
});
