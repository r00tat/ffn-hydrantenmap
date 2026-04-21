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

const mockRunLiveIdentification = vi.fn();
vi.mock('../../common/spectrumIdentification', () => ({
  runLiveIdentification: (...args: unknown[]) =>
    mockRunLiveIdentification(...args),
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
  mockRunLiveIdentification.mockReset();
  // Default: no identification so tests that don't care about the chip get
  // a stable "none"-ish return. The hysterese tests override this.
  mockRunLiveIdentification.mockReturnValue({ state: 'insufficient', total: 0 });
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

describe('RadiacodeCaptureDialog — Task 11 (live-nuclide-chip)', () => {
  it('shows "Sammle Daten" chip when total counts below threshold', () => {
    const lowCountSpectrum = makeSnapshot({
      counts: Array.from({ length: 1024 }, (_, i) => (i < 10 ? 5 : 0)),
    });
    mockRunLiveIdentification.mockReturnValue({
      state: 'insufficient',
      total: 50,
    });
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: lowCountSpectrum,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 1,
        },
      }),
    );
    render(<RadiacodeCaptureDialog open onClose={() => {}} />);
    expect(screen.getByText(/sammle daten/i)).toBeInTheDocument();
  });

  it('shows matched nuclide chip only after two consecutive confirming snapshots', async () => {
    // Counts above threshold so the "Sammle Daten" branch doesn't short-circuit.
    const highCountSpectrumA = makeSnapshot({
      counts: Array.from({ length: 1024 }, (_, i) => (i < 100 ? 20 : 0)),
      timestamp: 1_700_000_001_000,
    });
    const highCountSpectrumB = makeSnapshot({
      counts: Array.from({ length: 1024 }, (_, i) => (i < 100 ? 21 : 0)),
      timestamp: 1_700_000_002_000,
    });
    mockRunLiveIdentification.mockReturnValue({
      state: 'match',
      nuclide: 'Cs-137',
      confidence: 0.85,
      total: 2000,
    });

    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: highCountSpectrumA,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 1,
        },
      }),
    );
    const { rerender } = render(
      <RadiacodeCaptureDialog open onClose={() => {}} />,
    );

    // After first snapshot, the chip should NOT yet show Cs-137 (hysterese).
    expect(screen.queryByText(/Cs-137/)).not.toBeInTheDocument();
    expect(screen.getByText(/kein nuklid erkannt/i)).toBeInTheDocument();

    // Feed a second snapshot (new reference) confirming the same nuclide.
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: highCountSpectrumB,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 2,
        },
      }),
    );
    rerender(<RadiacodeCaptureDialog open onClose={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/Cs-137/)).toBeInTheDocument(),
    );
  });

  it('does not flip chip when different nuclide appears for only one snapshot', async () => {
    const snapA = makeSnapshot({
      counts: Array.from({ length: 1024 }, (_, i) => (i < 100 ? 20 : 0)),
      timestamp: 1_700_000_001_000,
    });
    const snapB = makeSnapshot({
      counts: Array.from({ length: 1024 }, (_, i) => (i < 100 ? 21 : 0)),
      timestamp: 1_700_000_002_000,
    });
    const snapC = makeSnapshot({
      counts: Array.from({ length: 1024 }, (_, i) => (i < 100 ? 22 : 0)),
      timestamp: 1_700_000_003_000,
    });

    // snap A: Cs-137. snap B: Co-60 (different). snap C: Co-60 (same as B).
    // Expected: after A → nothing (first sighting);
    //           after B → nothing (Co-60 first sighting, different from A);
    //           after C → Co-60 (two consecutive Co-60).
    mockRunLiveIdentification
      .mockReturnValueOnce({
        state: 'match',
        nuclide: 'Cs-137',
        confidence: 0.8,
        total: 2000,
      })
      .mockReturnValueOnce({
        state: 'match',
        nuclide: 'Co-60',
        confidence: 0.8,
        total: 2100,
      })
      .mockReturnValueOnce({
        state: 'match',
        nuclide: 'Co-60',
        confidence: 0.8,
        total: 2200,
      });

    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: snapA,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 1,
        },
      }),
    );
    const { rerender } = render(
      <RadiacodeCaptureDialog open onClose={() => {}} />,
    );
    expect(screen.queryByText(/Cs-137/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Co-60/)).not.toBeInTheDocument();

    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: snapB,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 2,
        },
      }),
    );
    rerender(<RadiacodeCaptureDialog open onClose={() => {}} />);

    // After B: Co-60 seen only once, different from Cs-137 → no chip yet.
    expect(screen.queryByText(/Cs-137/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Co-60/)).not.toBeInTheDocument();

    // Third snapshot confirms Co-60.
    mockedUseRadiacode.mockReturnValue(
      fixture({
        status: 'connected',
        device: { id: 'x', name: 'RC-103', serial: 'SN1' },
        spectrum: snapC,
        spectrumSession: {
          active: true,
          startedAt: 1_700_000_000_000,
          snapshotCount: 3,
        },
      }),
    );
    rerender(<RadiacodeCaptureDialog open onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Co-60/)).toBeInTheDocument(),
    );
  });
});
