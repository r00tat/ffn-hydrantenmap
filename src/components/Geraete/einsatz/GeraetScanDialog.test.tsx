// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarcodeScanEvent } from '../../../hooks/useBarcodeScanner';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

const scanner = vi.hoisted(() => ({
  onDetected: undefined as undefined | ((scan: BarcodeScanEvent) => void),
  active: false,
}));
vi.mock('../../../hooks/useBarcodeScanner', () => ({
  default: (options: { active: boolean; onDetected: (scan: BarcodeScanEvent) => void }) => {
    scanner.onDetected = options.onDetected;
    scanner.active = options.active;
    return { videoRef: { current: null }, status: 'unsupported', frames: 0 };
  },
}));

import GeraetScanDialog from './GeraetScanDialog';

describe('GeraetScanDialog', () => {
  beforeEach(() => {
    scanner.onDetected = undefined;
  });

  it('übernimmt einen Kamerascan genau einmal', () => {
    const onCode = vi.fn();
    const onClose = vi.fn();
    render(<GeraetScanDialog open onClose={onClose} onCode={onCode} />);
    expect(scanner.active).toBe(true);
    act(() => {
      scanner.onDetected?.({ value: 'ABC123' } as BarcodeScanEvent);
      scanner.onDetected?.({ value: 'ABC123' } as BarcodeScanEvent);
    });
    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith('ABC123');
    expect(onClose).toHaveBeenCalled();
  });

  it('übernimmt einen getippten Code mit Enter', async () => {
    const user = userEvent.setup();
    const onCode = vi.fn();
    render(<GeraetScanDialog open onClose={vi.fn()} onCode={onCode} />);
    expect(screen.getByText(/keine Kamera/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Code von Hand eingeben' }), ' 4711 {Enter}');
    expect(onCode).toHaveBeenCalledWith('4711');
  });
});
