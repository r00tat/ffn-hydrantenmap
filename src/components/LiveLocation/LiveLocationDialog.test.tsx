// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LiveLocationDialog from './LiveLocationDialog';
import {
  DEFAULT_DISTANCE_M,
  DEFAULT_HEARTBEAT_MS,
  LiveLocationSettings,
} from '../../hooks/useLiveLocationSettings';

const defaultSettings: LiveLocationSettings = {
  heartbeatMs: DEFAULT_HEARTBEAT_MS,
  distanceM: DEFAULT_DISTANCE_M,
};

describe('LiveLocationDialog', () => {
  it('renders title and body with firecall name', () => {
    render(
      <LiveLocationDialog
        open
        onClose={vi.fn()}
        firecallName="Kellerbrand Hauptstraße"
        settings={defaultSettings}
        setSettings={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('Standort teilen?')).toBeInTheDocument();
    expect(
      screen.getByText(/Kellerbrand Hauptstraße/),
    ).toBeInTheDocument();
  });

  it('shows current heartbeat and distance values from settings', () => {
    render(
      <LiveLocationDialog
        open
        onClose={vi.fn()}
        firecallName="Test"
        settings={{ heartbeatMs: 45_000, distanceM: 25 }}
        setSettings={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    // Expand advanced settings accordion to make sliders visible.
    fireEvent.click(screen.getByText('Erweiterte Einstellungen'));
    const heartbeatSlider = screen.getByLabelText(/Heartbeat/);
    const distanceSlider = screen.getByLabelText(/Distanz/);
    expect(heartbeatSlider).toHaveAttribute('value', '45000');
    expect(distanceSlider).toHaveAttribute('value', '25');
  });

  it('calls setSettings (if changed) and onStart when "Standort teilen" is clicked', () => {
    const setSettings = vi.fn();
    const onStart = vi.fn();
    render(
      <LiveLocationDialog
        open
        onClose={vi.fn()}
        firecallName="Test"
        settings={defaultSettings}
        setSettings={setSettings}
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Standort teilen' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    // Default values were used → no change → setSettings should not be called.
    expect(setSettings).not.toHaveBeenCalled();
  });

  it('calls setSettings with new values when slider changed before submit', () => {
    const setSettings = vi.fn();
    const onStart = vi.fn();
    render(
      <LiveLocationDialog
        open
        onClose={vi.fn()}
        firecallName="Test"
        settings={defaultSettings}
        setSettings={setSettings}
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByText('Erweiterte Einstellungen'));
    const heartbeatSlider = screen.getByLabelText(/Heartbeat/);
    fireEvent.change(heartbeatSlider, { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Standort teilen' }));
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeatMs: 60_000 }),
    );
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when "Abbrechen" is clicked', () => {
    const onClose = vi.fn();
    render(
      <LiveLocationDialog
        open
        onClose={onClose}
        firecallName="Test"
        settings={defaultSettings}
        setSettings={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalled();
  });
});
