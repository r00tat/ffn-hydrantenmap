// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TrackStartDialog from './TrackStartDialog';

describe('TrackStartDialog — Grundgerüst + Mode-Radio', () => {
  it('renders mode radios when open', () => {
    render(
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={vi.fn()} />,
    );
    expect(screen.getByLabelText('GPS-Track')).toBeInTheDocument();
    expect(screen.getByLabelText(/Strahlenmessung/)).toBeInTheDocument();
  });

  it('defaults mode to gps', () => {
    render(
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={vi.fn()} />,
    );
    expect(screen.getByLabelText('GPS-Track')).toBeChecked();
  });

  it('calls onStart with gps mode when Starten clicked', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={onStart} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'gps' }),
    );
  });

  it('switches to radiacode mode', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'radiacode' }),
    );
  });

  it('calls onClose when Abbrechen clicked', () => {
    const onClose = vi.fn();
    render(
      <TrackStartDialog open={true} onClose={onClose} onStart={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TrackStartDialog — Layer-Auswahl', () => {
  it('shows layer select only in radiacode mode', () => {
    render(
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Layer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    expect(screen.getByLabelText('Layer')).toBeInTheDocument();
  });

  it('defaults to new layer with generated name', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'radiacode',
        layer: expect.objectContaining({ type: 'new' }),
      }),
    );
    const call = onStart.mock.calls[0][0];
    expect(call.layer.name).toMatch(/Messung /);
  });

  it('uses custom name when user types it', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.change(screen.getByLabelText('Name des neuen Layers'), {
      target: { value: 'Kellerbrand Messung' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: { type: 'new', name: 'Kellerbrand Messung' },
      }),
    );
  });

  it('selects existing layer when picked from dropdown', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
        existingRadiacodeLayers={[
          {
            id: 'layer-1',
            name: 'Vorhandene Messung',
            type: 'layer',
            layerType: 'radiacode',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.mouseDown(screen.getByLabelText('Layer'));
    fireEvent.click(screen.getByRole('option', { name: 'Vorhandene Messung' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: { type: 'existing', id: 'layer-1' },
      }),
    );
  });
});

describe('TrackStartDialog — Sample-Rate + Device', () => {
  it('defaults sample rate to normal', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 'normal' }),
    );
  });

  it('passes selected sample rate', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.click(screen.getByLabelText('Hoch'));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 'hoch' }),
    );
  });

  it('adopts sample rate from selected existing layer', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
        existingRadiacodeLayers={[
          {
            id: 'layer-1',
            name: 'Bestehende',
            type: 'layer',
            layerType: 'radiacode',
            sampleRate: 'niedrig',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.mouseDown(screen.getByLabelText('Layer'));
    fireEvent.click(screen.getByRole('option', { name: 'Bestehende' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 'niedrig' }),
    );
  });

  it('shows default device name and serial', () => {
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={vi.fn()}
        defaultDevice={{ id: 'abc', name: 'RC-102', serial: 'SN1' }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    expect(screen.getByText('RC-102 (SN1)')).toBeInTheDocument();
  });

  it('shows placeholder when no default device', () => {
    render(
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    expect(screen.getByText('Kein Standardgerät')).toBeInTheDocument();
  });

  it('Wechseln button triggers onRequestDevice', () => {
    const onRequestDevice = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onRequestDevice={onRequestDevice}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.click(screen.getByRole('button', { name: 'Wechseln' }));
    expect(onRequestDevice).toHaveBeenCalled();
  });

  it('passes defaultDevice when starting in radiacode mode', () => {
    const onStart = vi.fn();
    const device = { id: 'abc', name: 'RC-102', serial: 'SN1' };
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        defaultDevice={device}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ device }),
    );
  });
});

describe('TrackStartDialog — Radiacode-Status-Gate', () => {
  it('zeigt Status-Chip im radiacode-Mode', () => {
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={vi.fn()}
        radiacodeStatus="unavailable"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    expect(screen.getByText('Gerät nicht erreichbar')).toBeInTheDocument();
  });

  it('disabled Start-Button wenn radiacode-mode und status !== connected', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="unavailable"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    const startBtn = screen.getByRole('button', { name: 'Starten' });
    expect(startBtn).toBeDisabled();
    fireEvent.click(startBtn);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Start-Button aktiv, wenn status === connected', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="connected"
      />,
    );
    fireEvent.click(screen.getByLabelText(/Strahlenmessung/));
    const startBtn = screen.getByRole('button', { name: 'Starten' });
    expect(startBtn).not.toBeDisabled();
    fireEvent.click(startBtn);
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'radiacode' }),
    );
  });

  it('Start-Button aktiv bei gps-mode, unabhängig von radiacode-status', () => {
    const onStart = vi.fn();
    render(
      <TrackStartDialog
        open={true}
        onClose={vi.fn()}
        onStart={onStart}
        radiacodeStatus="unavailable"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'gps' }),
    );
  });
});

describe('TrackStartDialog — Custom-Modus', () => {
  it('blendet Dose-Feld im GPS-Mode aus', async () => {
    const user = userEvent.setup();
    render(<TrackStartDialog open onClose={vi.fn()} onStart={vi.fn()} />);
    await user.click(screen.getByLabelText('Custom'));
    expect(screen.getByLabelText(/Abstand \(m\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zeitintervall \(s\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Dosisleistungs-Delta/)).toBeNull();
  });

  it('zeigt Dose-Feld im Radiacode-Mode', async () => {
    const user = userEvent.setup();
    render(
      <TrackStartDialog
        open
        onClose={vi.fn()}
        onStart={vi.fn()}
        defaultDevice={{ id: 'x', name: 'RC', serial: '1' }}
        radiacodeStatus="connected"
      />,
    );
    await user.click(screen.getByLabelText(/Strahlenmessung/));
    await user.click(screen.getByLabelText('Custom'));
    expect(screen.getByLabelText(/Dosisleistungs-Delta/)).toBeInTheDocument();
  });

  it('deaktiviert Start, wenn alle Custom-Felder leer', async () => {
    const user = userEvent.setup();
    render(<TrackStartDialog open onClose={vi.fn()} onStart={vi.fn()} />);
    await user.click(screen.getByLabelText('Custom'));
    const startBtn = screen.getByRole('button', { name: 'Starten' });
    expect(startBtn).toBeDisabled();
  });

  it('emittiert custom-struct on Starten', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<TrackStartDialog open onClose={vi.fn()} onStart={onStart} />);
    await user.click(screen.getByLabelText('Custom'));
    await user.type(screen.getByLabelText(/Abstand \(m\)/), '7');
    await user.type(screen.getByLabelText(/Zeitintervall \(s\)/), '20');
    await user.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'gps',
        sampleRate: { kind: 'custom', distanceM: 7, intervalSec: 20 },
      }),
    );
  });
});
