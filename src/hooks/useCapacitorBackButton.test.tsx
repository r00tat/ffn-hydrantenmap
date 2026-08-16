// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BackButtonListenerEvent } from '@capacitor/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn(() => true);
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({}),
}));

const addListener = vi.fn();
const exitApp = vi.fn();
vi.mock('@capacitor/app', () => ({ App: { addListener, exitApp } }));

const nativeStopGpsTrack = vi.fn();
vi.mock('./recording/nativeGpsTrackBridge', () => ({
  nativeStopGpsTrack: () => nativeStopGpsTrack(),
}));
const nativeStopTrack = vi.fn();
vi.mock('./radiacode/nativeTrackBridge', () => ({
  nativeStopTrack: () => nativeStopTrack(),
}));
const nativeDisconnect = vi.fn();
vi.mock('./radiacode/nativeBridge', () => ({
  nativeDisconnect: () => nativeDisconnect(),
}));
const notificationStop = vi.fn();
vi.mock('./radiacode/radiacodeNotification', () => ({
  RadiacodeNotification: { stop: () => notificationStop() },
}));

const closeTopmostModal = vi.fn<() => boolean>(() => false);
vi.mock('../common/closeTopmostModal', () => ({
  closeTopmostModal: () => closeTopmostModal(),
}));

import {
  EXIT_CONFIRM_TIMEOUT_MS,
  useCapacitorBackButton,
} from './useCapacitorBackButton';

/** Fires the most recently registered `backButton` listener. */
async function pressBack(canGoBack: boolean) {
  const handler = addListener.mock.calls.at(-1)?.[1] as (
    event: BackButtonListenerEvent,
  ) => Promise<void>;
  await act(async () => {
    await handler({ canGoBack });
  });
}

async function renderBackButtonHook() {
  const view = renderHook(() => useCapacitorBackButton());
  await waitFor(() => expect(addListener).toHaveBeenCalled());
  return view;
}

describe('useCapacitorBackButton', () => {
  let historyBack: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    isNativePlatform.mockReturnValue(true);
    closeTopmostModal.mockReturnValue(false);
    addListener.mockReset();
    addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
    exitApp.mockReset();
    exitApp.mockResolvedValue(undefined);
    for (const fn of [
      nativeStopGpsTrack,
      nativeStopTrack,
      nativeDisconnect,
      notificationStop,
    ]) {
      fn.mockReset();
      fn.mockResolvedValue(undefined);
    }
    historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    historyBack.mockRestore();
    vi.useRealTimers();
  });

  it('registers a backButton listener on a native platform', async () => {
    await renderBackButtonHook();
    expect(addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
  });

  it('does not touch the back button in the browser', async () => {
    isNativePlatform.mockReturnValue(false);
    renderHook(() => useCapacitorBackButton());
    await act(async () => {});
    expect(addListener).not.toHaveBeenCalled();
  });

  it('closes an open overlay instead of navigating or exiting', async () => {
    closeTopmostModal.mockReturnValue(true);
    await renderBackButtonHook();

    await pressBack(true);

    expect(historyBack).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('navigates one page back while history is left', async () => {
    await renderBackButtonHook();

    await pressBack(true);

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('asks for confirmation instead of exiting on the first press', async () => {
    const { result } = await renderBackButtonHook();

    await pressBack(false);

    expect(result.current.exitPromptOpen).toBe(true);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('exits and stops all native services on the second press', async () => {
    await renderBackButtonHook();

    await pressBack(false);
    await pressBack(false);

    expect(nativeStopGpsTrack).toHaveBeenCalled();
    expect(nativeStopTrack).toHaveBeenCalled();
    expect(nativeDisconnect).toHaveBeenCalled();
    expect(notificationStop).toHaveBeenCalled();
    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it('exits even when stopping a native service fails', async () => {
    nativeDisconnect.mockRejectedValue(new Error('BLE weg'));
    notificationStop.mockRejectedValue(new Error('kein Service'));
    await renderBackButtonHook();

    await pressBack(false);
    await pressBack(false);

    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it('re-asks for confirmation once the window has elapsed', async () => {
    const { result } = await renderBackButtonHook();

    await pressBack(false);
    await act(async () => {
      vi.advanceTimersByTime(EXIT_CONFIRM_TIMEOUT_MS + 1);
    });
    expect(result.current.exitPromptOpen).toBe(false);

    await pressBack(false);

    expect(exitApp).not.toHaveBeenCalled();
    expect(result.current.exitPromptOpen).toBe(true);
  });

  it('disarms the confirmation as soon as the user navigates again', async () => {
    const { result } = await renderBackButtonHook();

    await pressBack(false);
    expect(result.current.exitPromptOpen).toBe(true);

    // Der Nutzer öffnet eine Unterseite und drückt erneut zurück: das ist eine
    // Navigation, kein zweiter Beenden-Druck.
    await pressBack(true);
    expect(result.current.exitPromptOpen).toBe(false);

    await pressBack(false);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('lets the confirmation be dismissed from the outside', async () => {
    const { result } = await renderBackButtonHook();

    await pressBack(false);
    act(() => result.current.dismissExitPrompt());
    expect(result.current.exitPromptOpen).toBe(false);

    await pressBack(false);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    addListener.mockResolvedValue({ remove });
    const { unmount } = await renderBackButtonHook();

    unmount();
    await act(async () => {});

    expect(remove).toHaveBeenCalled();
  });
});
