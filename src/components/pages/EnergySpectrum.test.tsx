// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadiacodeContextValue } from '../providers/RadiacodeProvider';

vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => vi.fn(async () => ({ id: 'mock-doc' })),
}));

vi.mock('../../hooks/useFirecallItemUpdate', () => ({
  default: () => vi.fn(async () => {}),
}));

vi.mock('../../hooks/useFirebaseCollection', () => ({
  default: () => [],
}));

vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => 'test',
}));

vi.mock('../providers/RadiacodeProvider', async () => {
  const actual =
    await vi.importActual<typeof import('../providers/RadiacodeProvider')>(
      '../providers/RadiacodeProvider',
    );
  return {
    ...actual,
    useRadiacode: vi.fn(),
  };
});

// Ersetzt den Chart durch ein stummes Div — JSDOM hat kein Canvas.
vi.mock('./ZoomableSpectrumChart', () => ({
  default: () => <div data-testid="zoomable-spectrum-chart" />,
}));

import { useRadiacode } from '../providers/RadiacodeProvider';
import EnergySpectrum from './EnergySpectrum';

const mockedUseRadiacode = vi.mocked(useRadiacode);

function fixture(
  partial: Partial<RadiacodeContextValue> = {},
): RadiacodeContextValue {
  return {
    status: 'idle',
    device: null,
    deviceInfo: null,
    measurement: null,
    history: [],
    lastSampleTimestamp: null,
    error: null,
    scan: vi.fn(async () => null),
    connect: vi.fn(async () => {}),
    connectDevice: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    spectrum: null,
    cpsHistory: [],
    liveRecording: false,
    startLiveRecording: vi.fn(),
    stopLiveRecording: vi.fn(),
    resetLiveSpectrum: vi.fn(async () => {}),
    saveLiveSpectrum: vi.fn(async () => 'new-doc'),
    readSettings: vi.fn(async () => ({
      settings: {
        doseRateAlarm1uRh: 0,
        doseRateAlarm2uRh: 0,
        doseAlarm1uR: 0,
        doseAlarm2uR: 0,
        soundOn: true,
        soundVolume: 5,
        vibroOn: true,
        ledsOn: true,
        doseUnitsSv: true,
        countRateCpm: false,
        doseRateNSvh: false,
      },
      unsupportedFields: [],
    })),
    writeSettings: vi.fn(async () => {}),
    playSignal: vi.fn(async () => {}),
    doseReset: vi.fn(async () => {}),
    ...partial,
  };
}

describe('EnergySpectrum — Live-Spektrum', () => {
  beforeEach(() => {
    mockedUseRadiacode.mockReturnValue(fixture());
  });

  it('kein Live-Item wenn spectrum === null', () => {
    mockedUseRadiacode.mockReturnValue(fixture({ spectrum: null }));
    render(<EnergySpectrum />);
    expect(screen.queryByTestId('spectrum-color-live')).not.toBeInTheDocument();
  });

  it('Live-Item erscheint als erstes Listen-Element mit Magenta-Farbkreis', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN' },
        liveRecording: true,
        spectrum: {
          durationSec: 10,
          coefficients: [0, 2.5, 0] as [number, number, number],
          counts: [1, 2, 3, 4],
          timestamp: 1000,
        },
      }),
    );
    render(<EnergySpectrum />);
    expect(screen.getByText(/Live-Aufzeichnung/)).toBeInTheDocument();
    const colorCircle = screen.getByTestId('spectrum-color-live');
    expect(colorCircle).toHaveStyle({ backgroundColor: 'rgb(233, 30, 99)' });
  });

  it('Reset-Button ruft resetLiveSpectrum auf', async () => {
    const user = userEvent.setup();
    const resetLiveSpectrum = vi.fn(async () => {});
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN' },
        liveRecording: true,
        spectrum: {
          durationSec: 10,
          coefficients: [0, 2.5, 0] as [number, number, number],
          counts: [1, 2, 3, 4],
          timestamp: 1000,
        },
        resetLiveSpectrum,
      }),
    );
    render(<EnergySpectrum />);
    await user.click(screen.getByRole('button', { name: /reset live/i }));
    expect(resetLiveSpectrum).toHaveBeenCalled();
  });

  it('Speichern-Button öffnet Dialog und ruft saveLiveSpectrum mit Name auf', async () => {
    const user = userEvent.setup();
    const saveLiveSpectrum = vi.fn(async () => 'doc-1');
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN' },
        liveRecording: true,
        spectrum: {
          durationSec: 10,
          coefficients: [0, 2.5, 0] as [number, number, number],
          counts: [1, 2, 3, 4],
          timestamp: 1000,
        },
        saveLiveSpectrum,
      }),
    );
    render(<EnergySpectrum />);
    await user.click(screen.getByRole('button', { name: /^speichern$/i }));
    const dialog = await screen.findByRole('dialog');
    const nameField = within(dialog).getByLabelText(/^name$/i);
    await user.clear(nameField);
    await user.type(nameField, 'Testprobe');
    await user.click(
      within(dialog).getByRole('button', { name: /^speichern$/i }),
    );
    expect(saveLiveSpectrum).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Testprobe' }),
    );
  });

  it('Verbinden-Button ruft connect auf', async () => {
    const user = userEvent.setup();
    const connect = vi.fn(async () => {});
    mockedUseRadiacode.mockReturnValue(fixture({ connect }));
    render(<EnergySpectrum />);
    await user.click(screen.getByRole('button', { name: /^verbinden$/i }));
    expect(connect).toHaveBeenCalled();
  });

  it('Live-Aufzeichnung-Button ist deaktiviert solange nicht verbunden', () => {
    mockedUseRadiacode.mockReturnValue(fixture({ status: 'idle' }));
    render(<EnergySpectrum />);
    expect(
      screen.getByRole('button', { name: /live-aufzeichnung/i }),
    ).toBeDisabled();
  });

  it('Live-Aufzeichnung-Button ruft startLiveRecording auf wenn verbunden', async () => {
    const user = userEvent.setup();
    const startLiveRecording = vi.fn();
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN' },
        liveRecording: false,
        startLiveRecording,
      }),
    );
    render(<EnergySpectrum />);
    await user.click(
      screen.getByRole('button', { name: /live-aufzeichnung/i }),
    );
    expect(startLiveRecording).toHaveBeenCalled();
  });

  it('Aufzeichnung-stoppen-Button ruft stopLiveRecording auf', async () => {
    const user = userEvent.setup();
    const stopLiveRecording = vi.fn();
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN' },
        liveRecording: true,
        stopLiveRecording,
      }),
    );
    render(<EnergySpectrum />);
    await user.click(
      screen.getByRole('button', { name: /aufzeichnung stoppen/i }),
    );
    expect(stopLiveRecording).toHaveBeenCalled();
  });

  it('Reset- und Speichern-Buttons sind ausgeblendet wenn liveRecording === false', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN' },
        liveRecording: false,
        spectrum: {
          durationSec: 10,
          coefficients: [0, 2.5, 0] as [number, number, number],
          counts: [1, 2, 3, 4],
          timestamp: 1000,
        },
      }),
    );
    render(<EnergySpectrum />);
    expect(
      screen.queryByRole('button', { name: /reset live/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^speichern$/i }),
    ).not.toBeInTheDocument();
  });
});
