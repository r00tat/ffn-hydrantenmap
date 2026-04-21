// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  RadiacodeSettings,
  RadiacodeSettingsReadResult,
} from '../../hooks/radiacode/types';
import RadiacodeSettingsDialog from './RadiacodeSettingsDialog';

function makeSettings(partial: Partial<RadiacodeSettings> = {}): RadiacodeSettings {
  return {
    doseRateAlarm1uRh: 100_000,
    doseRateAlarm2uRh: 500_000,
    doseAlarm1uR: 100_000_000,
    doseAlarm2uR: 500_000_000,
    soundOn: true,
    soundVolume: 5,
    vibroOn: true,
    ledsOn: false,
    doseUnitsSv: true,
    countRateCpm: false,
    doseRateNSvh: false,
    ...partial,
  };
}

function makeResult(
  overrides: Partial<RadiacodeSettingsReadResult> = {},
): RadiacodeSettingsReadResult {
  return {
    settings: makeSettings(),
    unsupportedFields: [],
    ...overrides,
  };
}

describe('RadiacodeSettingsDialog', () => {
  it('loads settings from the device when opened', async () => {
    const readSettings = vi.fn(async () => makeResult());
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={readSettings}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await waitFor(() => expect(readSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue('1000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
  });

  it('shows an error alert when readSettings fails, action buttons remain enabled', async () => {
    const readSettings = vi.fn(async () => {
      throw new Error('BLE timeout');
    });
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={readSettings}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    expect(await screen.findByText(/BLE timeout/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signalton/i })).toBeEnabled();
  });

  it('Speichern ruft writeSettings nur mit geaenderten Feldern', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const readSettings = vi.fn(async () => makeResult());
    const writeSettings = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <RadiacodeSettingsDialog
        open
        onClose={onClose}
        readSettings={readSettings}
        writeSettings={writeSettings}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await waitFor(() => expect(readSettings).toHaveBeenCalled());
    const vibroSwitch = screen.getByRole('switch', { name: /vibration/i });
    await user.click(vibroSwitch);
    await user.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() => expect(writeSettings).toHaveBeenCalledTimes(1));
    expect(writeSettings).toHaveBeenCalledWith({ vibroOn: false });
    expect(onClose).toHaveBeenCalled();
  });

  it('Abbrechen ruft writeSettings nicht auf, onClose ja', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const writeSettings = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <RadiacodeSettingsDialog
        open
        onClose={onClose}
        readSettings={vi.fn(async () => makeResult())}
        writeSettings={writeSettings}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /vibration/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /abbrechen/i }));
    expect(onClose).toHaveBeenCalled();
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('Speichern ist disabled wenn nichts geaendert wurde', async () => {
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={vi.fn(async () => makeResult())}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: /vibration/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('Signalton-Button ruft playSignal sofort', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const playSignal = vi.fn(async () => {});
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={vi.fn(async () => makeResult())}
        writeSettings={vi.fn(async () => {})}
        playSignal={playSignal}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await user.click(screen.getByRole('button', { name: /signalton/i }));
    expect(playSignal).toHaveBeenCalledTimes(1);
  });

  it('Dosis-Reset verlangt Bestaetigung bevor doseReset aufgerufen wird', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const doseReset = vi.fn(async () => {});
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={vi.fn(async () => makeResult())}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={doseReset}
      />,
    );
    const resetBtn = screen.getByRole('button', {
      name: /dosis zurücksetzen/i,
    });
    await user.click(resetBtn);
    expect(doseReset).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^ja$/i }));
    await waitFor(() => expect(doseReset).toHaveBeenCalledTimes(1));
  });

  it('Dosis-Reset „Nein" bricht ohne doseReset-Aufruf ab', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const doseReset = vi.fn(async () => {});
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={vi.fn(async () => makeResult())}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={doseReset}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: /dosis zurücksetzen/i }),
    );
    await user.click(screen.getByRole('button', { name: /nein/i }));
    expect(doseReset).not.toHaveBeenCalled();
  });

  it('blendet nicht unterstützte Felder aus und zeigt einen Info-Hinweis', async () => {
    const { ledsOn: _ledsOn, ...rest } = makeSettings();
    void _ledsOn;
    const readSettings = vi.fn(
      async (): Promise<RadiacodeSettingsReadResult> => ({
        settings: rest,
        unsupportedFields: ['ledsOn'],
      }),
    );
    render(
      <RadiacodeSettingsDialog
        open
        onClose={vi.fn()}
        readSettings={readSettings}
        writeSettings={vi.fn(async () => {})}
        playSignal={vi.fn(async () => {})}
        doseReset={vi.fn(async () => {})}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: /vibration/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('switch', { name: /^leds$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unterstützt/i)).toBeInTheDocument();
    expect(screen.getByText(/LEDs/)).toBeInTheDocument();
  });
});
