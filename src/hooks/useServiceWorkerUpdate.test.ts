// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockShowSnackbar = vi.fn();

vi.mock('../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => mockShowSnackbar,
}));

import useServiceWorkerUpdate from './useServiceWorkerUpdate';

describe('useServiceWorkerUpdate', () => {
  let listeners: Record<string, EventListener>;

  beforeEach(() => {
    listeners = {};
    mockShowSnackbar.mockClear();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: (event: string, cb: EventListener) => {
          listeners[event] = cb;
        },
        removeEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a controllerchange listener', () => {
    renderHook(() => useServiceWorkerUpdate());
    expect(listeners['controllerchange']).toBeDefined();
  });

  it('shows snackbar with reload action on controllerchange', () => {
    renderHook(() => useServiceWorkerUpdate());

    listeners['controllerchange'](new Event('controllerchange'));

    expect(mockShowSnackbar).toHaveBeenCalledWith(
      'Neue Version verfügbar',
      'info',
      expect.objectContaining({ label: 'Neu laden' }),
    );
  });

  it('removes listener on unmount', () => {
    const { unmount } = renderHook(() => useServiceWorkerUpdate());
    unmount();

    expect(navigator.serviceWorker.removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
    );
  });
});
