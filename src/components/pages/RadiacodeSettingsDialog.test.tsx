// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RadiacodeSettings } from '../../hooks/radiacode/types';
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

describe('RadiacodeSettingsDialog', () => {
  it('loads settings from the device when opened', async () => {
    const readSettings = vi.fn(async () => makeSettings());
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
});
