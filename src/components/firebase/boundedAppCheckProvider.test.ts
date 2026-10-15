import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseGetToken = vi.fn();
const baseInitialize = vi.fn();

vi.mock('firebase/app-check', () => {
  class ReCaptchaEnterpriseProvider {
    constructor(public siteKey: string) {}
  }
  Object.assign(ReCaptchaEnterpriseProvider.prototype, {
    getToken(...args: unknown[]) {
      return baseGetToken(...args);
    },
    initialize(...args: unknown[]) {
      return baseInitialize(...args);
    },
  });
  return { ReCaptchaEnterpriseProvider };
});

import { TimeoutError } from '../../lib/withTimeout';
import { BoundedReCaptchaEnterpriseProvider } from './boundedAppCheckProvider';

const APP = { name: '[DEFAULT]' } as never;
const TOKEN = { token: 'tok', expireTimeMillis: 1, issuedAtTimeMillis: 0 };

interface Internal {
  initialize(app: unknown): void;
  getToken(): Promise<unknown>;
}

function create(deps: Partial<ConstructorParameters<typeof BoundedReCaptchaEnterpriseProvider>[1]> = {}) {
  const provider = new BoundedReCaptchaEnterpriseProvider('site-key', {
    timeoutMs: 20,
    hasRecaptcha: () => true,
    loadScript: vi.fn(async () => {}),
    onTimeout: vi.fn(),
    ...deps,
  });
  const internal = provider as unknown as Internal;
  internal.initialize(APP);
  return internal;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BoundedReCaptchaEnterpriseProvider', () => {
  it('initializes the reCAPTCHA provider with the app', () => {
    create();
    expect(baseInitialize).toHaveBeenCalledWith(APP);
  });

  it('passes the token of the reCAPTCHA provider through', async () => {
    baseGetToken.mockResolvedValue(TOKEN);
    await expect(create().getToken()).resolves.toBe(TOKEN);
  });

  it('gives up on a hanging token request', async () => {
    baseGetToken.mockReturnValue(new Promise(() => {}));
    const onTimeout = vi.fn();
    await expect(create({ onTimeout }).getToken()).rejects.toBeInstanceOf(
      TimeoutError,
    );
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('reloads reCAPTCHA after a timeout when the script never loaded', async () => {
    let recaptchaLoaded = false;
    const loadScript = vi.fn(async () => {
      recaptchaLoaded = true;
    });
    const provider = create({ hasRecaptcha: () => recaptchaLoaded, loadScript });

    baseGetToken.mockReturnValueOnce(new Promise(() => {}));
    await expect(provider.getToken()).rejects.toBeInstanceOf(TimeoutError);

    baseGetToken.mockResolvedValueOnce(TOKEN);
    await expect(provider.getToken()).resolves.toBe(TOKEN);
    expect(loadScript).toHaveBeenCalledTimes(1);
    // Einmal beim Start, einmal nach dem Nachladen.
    expect(baseInitialize).toHaveBeenCalledTimes(2);
  });

  it('does not reinitialize when reCAPTCHA is present', async () => {
    const loadScript = vi.fn(async () => {});
    const provider = create({ loadScript });

    baseGetToken.mockReturnValueOnce(new Promise(() => {}));
    await expect(provider.getToken()).rejects.toBeInstanceOf(TimeoutError);
    baseGetToken.mockResolvedValueOnce(TOKEN);
    await provider.getToken();

    expect(loadScript).not.toHaveBeenCalled();
    expect(baseInitialize).toHaveBeenCalledTimes(1);
  });

  it('keeps failing softly when the script still cannot be loaded', async () => {
    const loadScript = vi.fn(async () => {
      throw new Error('offline');
    });
    const provider = create({ hasRecaptcha: () => false, loadScript });

    baseGetToken.mockReturnValue(new Promise(() => {}));
    await expect(provider.getToken()).rejects.toBeInstanceOf(TimeoutError);
    await expect(provider.getToken()).rejects.toThrow('offline');
    expect(baseInitialize).toHaveBeenCalledTimes(1);
  });
});
