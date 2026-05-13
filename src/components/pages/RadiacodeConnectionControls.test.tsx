// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithIntl as render } from '../../test-utils/intlRender';

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

  it('ist in allen Status aktiv', () => {
    for (const status of [
      'idle',
      'connecting',
      'reconnecting',
      'connected',
    ] as const) {
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

describe('RadiacodeConnectionControls — Status-Chips', () => {
  it('zeigt keine Status-Chips, wenn keine Messung vorliegt', () => {
    const ctx = makeCtx({ measurement: null });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    expect(screen.queryByTestId('radiacode-chip-battery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radiacode-chip-temperature')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radiacode-chip-doserate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radiacode-chip-cps')).not.toBeInTheDocument();
  });

  it('zeigt Akku/Temperatur/Dosisleistung/CPS, wenn Messung vorliegt', () => {
    const ctx = makeCtx({
      measurement: {
        dosisleistung: 0.15,
        cps: 18,
        timestamp: Date.now(),
        chargePct: 73,
        temperatureC: 24.3,
      },
    });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    expect(screen.getByTestId('radiacode-chip-battery')).toHaveTextContent('73');
    expect(screen.getByTestId('radiacode-chip-battery')).toHaveTextContent('%');
    expect(screen.getByTestId('radiacode-chip-temperature')).toHaveTextContent('24.3');
    expect(screen.getByTestId('radiacode-chip-temperature')).toHaveTextContent('°C');
    expect(screen.getByTestId('radiacode-chip-doserate')).toHaveTextContent('0.15');
    expect(screen.getByTestId('radiacode-chip-doserate')).toHaveTextContent('µSv/h');
    expect(screen.getByTestId('radiacode-chip-cps')).toHaveTextContent('18');
    expect(screen.getByTestId('radiacode-chip-cps')).toHaveTextContent('cps');
  });

  it('blendet Akku- und Temperatur-Chip aus, wenn die Felder fehlen', () => {
    const ctx = makeCtx({
      measurement: {
        dosisleistung: 0.15,
        cps: 18,
        timestamp: Date.now(),
      },
    });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    expect(screen.queryByTestId('radiacode-chip-battery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radiacode-chip-temperature')).not.toBeInTheDocument();
    expect(screen.getByTestId('radiacode-chip-doserate')).toBeInTheDocument();
    expect(screen.getByTestId('radiacode-chip-cps')).toBeInTheDocument();
  });

  it('Akku-Chip ist rot bei niedrigem Ladestand (<20 %)', () => {
    const ctx = makeCtx({
      measurement: {
        dosisleistung: 0.1,
        cps: 5,
        timestamp: Date.now(),
        chargePct: 15,
      },
    });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    expect(screen.getByTestId('radiacode-chip-battery').className).toMatch(
      /colorError/,
    );
  });

  it('Akku-Chip ist warnend bei mittlerem Ladestand (<50 %)', () => {
    const ctx = makeCtx({
      measurement: {
        dosisleistung: 0.1,
        cps: 5,
        timestamp: Date.now(),
        chargePct: 35,
      },
    });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    expect(screen.getByTestId('radiacode-chip-battery').className).toMatch(
      /colorWarning/,
    );
  });

  it('Akku-Chip ist neutral bei vollem Akku (>=50 %)', () => {
    const ctx = makeCtx({
      measurement: {
        dosisleistung: 0.1,
        cps: 5,
        timestamp: Date.now(),
        chargePct: 80,
      },
    });
    render(
      <RadiacodeContext.Provider value={ctx}>
        <RadiacodeConnectionControls />
      </RadiacodeContext.Provider>,
    );
    const chip = screen.getByTestId('radiacode-chip-battery');
    expect(chip.className).not.toMatch(/colorError/);
    expect(chip.className).not.toMatch(/colorWarning/);
  });
});
