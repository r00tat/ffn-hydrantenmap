// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadiacodeContextValue } from '../providers/RadiacodeProvider';
import { SpectrumSnapshot } from '../../hooks/radiacode/protocol';

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

const mockAdd = vi.fn(async (item: unknown) => ({ id: 'new-doc' }));
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => mockAdd,
}));

const mockShowSnackbar = vi.fn();
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => mockShowSnackbar,
}));

// Mock MUI X LineChart — no canvas rendering in JSDOM.
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ yAxis }: { yAxis?: { scaleType?: string }[] }) => (
    <div
      data-testid="linechart"
      data-scale={yAxis?.[0]?.scaleType ?? 'linear'}
    />
  ),
}));

import { useRadiacode } from '../providers/RadiacodeProvider';
import RadiacodeCaptureDialog from './RadiacodeCaptureDialog';

const mockedUseRadiacode = vi.mocked(useRadiacode);

function makeSnapshot(partial: Partial<SpectrumSnapshot> = {}): SpectrumSnapshot {
  return {
    durationSec: 60,
    coefficients: [0, 2.5, 0] as [number, number, number],
    counts: Array.from({ length: 1024 }, () => 0),
    timestamp: 1_700_000_000_000,
    ...partial,
  };
}

function fixture(
  partial: Partial<RadiacodeContextValue> = {},
): RadiacodeContextValue {
  return {
    status: 'idle',
    device: null,
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

beforeEach(() => {
  mockAdd.mockClear();
  mockShowSnackbar.mockClear();
});

describe('RadiacodeCaptureDialog — Task 10', () => {
  it('starts in disconnected state and shows Verbinden button', () => {
    mockedUseRadiacode.mockReturnValue(fixture({ status: 'idle' }));
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /verbinden/i })).toBeInTheDocument();
  });

  it('shows Aufnahme starten button when connected and idle', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
      }),
    );
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    expect(
      screen.getByRole('button', { name: /aufnahme starten/i }),
    ).toBeEnabled();
  });

  it('transitions to recording state on start click', async () => {
    const user = userEvent.setup();
    const startSpectrumRecording = vi.fn(async () => {});
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        startSpectrumRecording,
      }),
    );
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /aufnahme starten/i }));
    expect(startSpectrumRecording).toHaveBeenCalled();
  });

  it('stop & save calls addItem with the expected spectrum schema', async () => {
    const user = userEvent.setup();
    const snap = makeSnapshot({ durationSec: 42, timestamp: 1_700_000_042_000 });
    const stopSpectrumRecording = vi.fn(async () => snap);
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: snap,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 4,
        },
        stopSpectrumRecording,
      }),
    );
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /stop.*speichern/i }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    const item = mockAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(item.type).toBe('spectrum');
    expect(item.measurementTime).toBe(42);
    expect(item.liveTime).toBe(42);
    expect(item.counts).toEqual(snap.counts);
    expect(item.coefficients).toEqual(snap.coefficients);
    expect(item.deviceName).toContain('RC-103');
    expect(item.deviceName).toContain('SN1');
    expect(typeof item.startTime).toBe('string');
    expect(typeof item.endTime).toBe('string');
    expect(typeof item.name).toBe('string');
  });

  it('cancel discards the session without writing', async () => {
    const user = userEvent.setup();
    const cancelSpectrumRecording = vi.fn(async () => {});
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: makeSnapshot(),
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 2,
        },
        cancelSpectrumRecording,
      }),
    );
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /abbrechen/i }));
    expect(cancelSpectrumRecording).toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('shows reconnecting overlay when status is connecting during active session', () => {
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connecting',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: makeSnapshot(),
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 2,
        },
      }),
    );
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    expect(screen.getByText(/verbinde erneut/i)).toBeInTheDocument();
  });
});
