// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={onStart} />,
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
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={onStart} />,
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
      <TrackStartDialog open={true} onClose={vi.fn()} onStart={onStart} />,
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
