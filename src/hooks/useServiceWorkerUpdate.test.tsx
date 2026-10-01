// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode } from 'react';
import deMessages from '../../messages/de.json';

const mockShowSnackbar = vi.fn();
const mockRequestWorkerBuildId = vi.fn();

vi.mock('../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => mockShowSnackbar,
}));

vi.mock('../common/serviceWorker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/serviceWorker')>()),
  requestWorkerBuildId: (worker: ServiceWorker | null) =>
    mockRequestWorkerBuildId(worker),
}));

import useServiceWorkerUpdate from './useServiceWorkerUpdate';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="de" messages={deMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const oldWorker = { scriptURL: '/serwist/sw.js' } as ServiceWorker;
const newWorker = { scriptURL: '/serwist/sw.js' } as ServiceWorker;

describe('useServiceWorkerUpdate', () => {
  let listeners: Record<string, EventListener>;
  let container: { controller: ServiceWorker | null };

  function mockContainer(controller: ServiceWorker | null) {
    container = {
      controller,
      addEventListener: (event: string, cb: EventListener) => {
        listeners[event] = cb;
      },
      removeEventListener: vi.fn(),
    } as unknown as { controller: ServiceWorker | null };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: container,
      configurable: true,
      writable: true,
    });
  }

  function switchController(worker: ServiceWorker) {
    container.controller = worker;
    listeners['controllerchange'](new Event('controllerchange'));
  }

  beforeEach(() => {
    listeners = {};
    mockShowSnackbar.mockClear();
    mockRequestWorkerBuildId.mockReset();
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', 'v1.0.0');
    mockContainer(oldWorker);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers a controllerchange listener', () => {
    renderHook(() => useServiceWorkerUpdate(), { wrapper });
    expect(listeners['controllerchange']).toBeDefined();
  });

  it('shows snackbar with reload action when the new worker is another build', async () => {
    mockRequestWorkerBuildId.mockResolvedValue('v1.1.0');
    renderHook(() => useServiceWorkerUpdate(), { wrapper });

    switchController(newWorker);

    await waitFor(() =>
      expect(mockShowSnackbar).toHaveBeenCalledWith(
        'Neue Version verfügbar',
        'info',
        expect.objectContaining({ label: 'Neu laden' }),
      ),
    );
    expect(mockRequestWorkerBuildId).toHaveBeenCalledWith(newWorker);
  });

  it('stays silent when the page already runs the build of the new worker', async () => {
    // Die Navigation kam frisch vom Netz, der Worker wurde erst danach
    // erneuert — neu laden brächte nichts.
    mockRequestWorkerBuildId.mockResolvedValue('v1.0.0');
    renderHook(() => useServiceWorkerUpdate(), { wrapper });

    switchController(newWorker);

    await waitFor(() => expect(mockRequestWorkerBuildId).toHaveBeenCalled());
    await Promise.resolve();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
  });

  it('stays silent when the worker takes over a page it did not control yet', async () => {
    // Erster Aufruf, harter Reload oder nach dem Zurücksetzen: clientsClaim()
    // löst controllerchange aus, eine neue Version ist das nicht.
    mockContainer(null);
    mockRequestWorkerBuildId.mockResolvedValue('v1.1.0');
    renderHook(() => useServiceWorkerUpdate(), { wrapper });

    switchController(newWorker);

    await Promise.resolve();
    expect(mockRequestWorkerBuildId).not.toHaveBeenCalled();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
  });

  it('announces a later update after the first takeover', async () => {
    mockContainer(null);
    mockRequestWorkerBuildId.mockResolvedValue('v1.1.0');
    renderHook(() => useServiceWorkerUpdate(), { wrapper });

    switchController(oldWorker);
    switchController(newWorker);

    await waitFor(() => expect(mockShowSnackbar).toHaveBeenCalledTimes(1));
  });

  it('removes listener on unmount', () => {
    const { unmount } = renderHook(() => useServiceWorkerUpdate(), { wrapper });
    unmount();

    expect(navigator.serviceWorker.removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
    );
  });
});
