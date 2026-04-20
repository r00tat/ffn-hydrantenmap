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
