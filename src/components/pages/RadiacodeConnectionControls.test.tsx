// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Side-effect-Imports der RadiacodeProvider-Kette mocken, damit der Test
// nicht über die Firebase-Initialisierung in useFirecallItemAdd stolpert.
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => vi.fn(),
}));
vi.mock('../../hooks/radiacode/devicePreference', () => ({
  loadDefaultDevice: vi.fn(async () => null),
  saveDefaultDevice: vi.fn(async () => {}),
  clearDefaultDevice: vi.fn(async () => {}),
}));
vi.mock('../../hooks/radiacode/radiacodeNotification', () => ({
  RadiacodeNotification: {
    getState: vi.fn(async () => ({
      connected: false,
      deviceAddress: null,
      radiacodeTracking: false,
      gpsTracking: false,
    })),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
  },
}));
vi.mock('./RadiacodeSettingsDialog', () => ({
  default: () => null,
}));

import RadiacodeConnectionControls from './RadiacodeConnectionControls';
import {
  RadiacodeContext,
  RadiacodeContextValue,
} from '../providers/RadiacodeProvider';

function makeCtx(
  overrides: Partial<RadiacodeContextValue> = {},
): RadiacodeContextValue {
  return {
    status: 'idle',
    device: null,
    deviceInfo: null,
    measurement: null,
    lastSampleTimestamp: null,
    history: [],
    error: null,
    scan: vi.fn(),
    connect: vi.fn(),
    connectDevice: vi.fn(),
    disconnect: vi.fn(),
    spectrum: null,
    liveRecording: false,
    startLiveRecording: vi.fn(),
    stopLiveRecording: vi.fn(),
    resetLiveSpectrum: vi.fn(),
    saveLiveSpectrum: vi.fn(),
    readSettings: vi.fn(),
    writeSettings: vi.fn(),
    playSignal: vi.fn(),
    doseReset: vi.fn(),
    refreshConnectionState: vi.fn(),
    ...overrides,
  } as unknown as RadiacodeContextValue;
}

describe('RadiacodeConnectionControls — Refresh-Button', () => {
  it('ruft refreshConnectionState beim Klick', () => {
    const refresh = vi.fn();
    const ctx = makeCtx({ refreshConnectionState: refresh });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verbindungsstatus prüfen' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('ist deaktiviert während connecting', () => {
    const ctx = makeCtx({ status: 'connecting' });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    const btn = screen.getByRole('button', { name: 'Verbindungsstatus prüfen' });
    expect(btn).toBeDisabled();
  });

  it('ist deaktiviert während reconnecting', () => {
    const ctx = makeCtx({ status: 'reconnecting' });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    const btn = screen.getByRole('button', { name: 'Verbindungsstatus prüfen' });
    expect(btn).toBeDisabled();
  });

  it('ist aktiv während idle und connected', () => {
    for (const status of ['idle', 'connected'] as const) {
      const ctx = makeCtx({ status });
      const { unmount } = render(
        <RadiacodeContext.Provider value={ctx}>
          <RadiacodeConnectionControls />
        </RadiacodeContext.Provider>,
      );
      const btn = screen.getByRole('button', { name: 'Verbindungsstatus prüfen' });
      expect(btn).not.toBeDisabled();
      unmount();
    }
  });
});
