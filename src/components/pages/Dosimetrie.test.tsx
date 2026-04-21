// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadiacodeContextValue } from '../providers/RadiacodeProvider';

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

// Mock MUI X LineChart to avoid canvas rendering in JSDOM.
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ yAxis }: { yAxis?: { scaleType?: string }[] }) => (
    <div
      data-testid="linechart"
      data-scale={yAxis?.[0]?.scaleType ?? 'linear'}
    />
  ),
}));

import { useRadiacode } from '../providers/RadiacodeProvider';
import Dosimetrie from './Dosimetrie';

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
    error: null,
    scan: vi.fn(async () => null),
    connect: vi.fn(async () => {}),
    connectDevice: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    spectrum: null,
    spectrumSession: { active: false, startedAt: null, snapshotCount: 0 },
    startSpectrumRecording: vi.fn(async () => {}),
    stopSpectrumRecording: vi.fn(async () => null),
    cancelSpectrumRecording: vi.fn(async () => {}),
    ...partial,
  };
}

describe('Dosimetrie', () => {
  it('renders connect button and placeholders when disconnected', () => {
    mockedUseRadiacode.mockReturnValue(fixture());
    render(<Dosimetrie />);
    expect(screen.getByRole('button', { name: /verbinden/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /trennen/i })).toBeDisabled();
    expect(screen.getByText(/keine messdaten/i)).toBeInTheDocument();
  });

  it('renders live values and enabled disconnect when connected', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'id', name: 'RC-103', serial: 'SN123' },
        measurement: {
          dosisleistung: 0.25,
          cps: 7,
          timestamp: 1000,
          dose: 456,
        },
        history: [
          { t: 0, dosisleistung: 0.2, cps: 5 },
          { t: 1000, dosisleistung: 0.25, cps: 7 },
        ],
      }),
    );
    render(<Dosimetrie />);
    expect(screen.getByText(/RC-103/)).toBeInTheDocument();
    expect(screen.getByText(/0\.25/)).toBeInTheDocument();
    expect(screen.getByText(/µSv\/h/)).toBeInTheDocument();
    expect(screen.getByText(/456/)).toBeInTheDocument();
    expect(screen.getByText(/^7$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trennen/i })).toBeEnabled();
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
  });

  it('toggles chart y-axis between linear and log', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'id', name: 'RC-103', serial: 'SN' },
        measurement: { dosisleistung: 1, cps: 1, timestamp: 1 },
        history: [{ t: 1, dosisleistung: 1, cps: 1 }],
      }),
    );
    render(<Dosimetrie />);
    const chart = screen.getByTestId('linechart');
    expect(chart.getAttribute('data-scale')).toBe('linear');
    await user.click(screen.getByRole('checkbox', { name: /log/i }));
    expect(screen.getByTestId('linechart').getAttribute('data-scale')).toBe(
      'log',
    );
  });

  it('shows error alert on error state', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({ status: 'error', error: 'BLE denied' }),
    );
    render(<Dosimetrie />);
    expect(screen.getByText(/BLE denied/)).toBeInTheDocument();
  });
});
