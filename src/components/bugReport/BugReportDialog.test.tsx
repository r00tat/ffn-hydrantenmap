// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- Mocks for module-level dependencies -------------------------------------

const captureScreenshotMock = vi.fn();
const isScreenshotSupportedMock = vi.fn(() => true);
vi.mock('./captureScreenshot', () => ({
  captureScreenshot: (...args: unknown[]) => captureScreenshotMock(...args),
  isScreenshotSupported: () => isScreenshotSupportedMock(),
}));

const uploadBugReportFileMock = vi.fn();
vi.mock('./uploadBugReportFile', () => ({
  uploadBugReportFile: (...args: unknown[]) => uploadBugReportFileMock(...args),
}));

const submitBugReportActionMock = vi.fn();
vi.mock('./submitBugReportAction', () => ({
  submitBugReportAction: (...args: unknown[]) => submitBugReportActionMock(...args),
}));

const setDisplayMessagesMock = vi.fn();
const useDebugLoggingMock = vi.fn(() => ({
  messages: [
    { id: '1', message: 'log A', properties: { level: 'INFO' } },
    { id: '2', message: 'log B', properties: { level: 'WARN' } },
  ],
  displayMessages: false,
  setDisplayMessages: setDisplayMessagesMock,
}));
vi.mock('../../hooks/useDebugging', () => ({
  useDebugLogging: () => useDebugLoggingMock(),
}));

const showSnackbarMock = vi.fn();
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

vi.mock('../../hooks/useFirecall', () => ({
  useFirecall: () => ({ id: 'fc1', name: 'Einsatz 1' }),
  useFirecallId: () => 'fc1',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/some/path',
}));

// uuid: deterministic id for assertions
vi.mock('uuid', () => ({
  v4: () => 'report-uuid-1',
}));

// captureScreenshot module mocked above (no real navigator needed)

// The selector has its own tests; here it only hands back a fixed result.
vi.mock('./RegionSelector', () => ({
  __esModule: true,
  default: ({
    open,
    image,
    mode,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    image: Blob | null;
    mode?: string;
    onConfirm: (b: Blob) => void;
    onCancel: () => void;
  }) =>
    open && image ? (
      <div data-testid="region-selector" data-mode={mode ?? 'capture'}>
        <button type="button" onClick={() => onConfirm(croppedBlob)}>
          confirm-region
        </button>
        <button type="button" onClick={onCancel}>
          cancel-region
        </button>
      </div>
    ) : null,
}));
const croppedBlob = new Blob(['cropped'], { type: 'image/png' });

// --- Import after mocks ------------------------------------------------------
import HotkeyProvider from '../hotkeys/HotkeyProvider';
import BugReportDialog from './BugReportDialog';

describe('BugReportDialog', () => {
  beforeEach(() => {
    captureScreenshotMock.mockReset();
    isScreenshotSupportedMock.mockReset();
    isScreenshotSupportedMock.mockReturnValue(true);
    uploadBugReportFileMock.mockReset();
    uploadBugReportFileMock.mockImplementation(
      async (_id: string, _blob: Blob, name: string) => `/bugReports/report-uuid-1/uuid-${name}`,
    );
    submitBugReportActionMock.mockReset();
    submitBugReportActionMock.mockResolvedValue({ reportId: 'report-uuid-1' });
    setDisplayMessagesMock.mockReset();
    showSnackbarMock.mockReset();
    useDebugLoggingMock.mockReturnValue({
      messages: [
        { id: '1', message: 'log A', properties: { level: 'INFO' } },
        { id: '2', message: 'log B', properties: { level: 'WARN' } },
      ],
      displayMessages: false,
      setDisplayMessages: setDisplayMessagesMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('disables submit when title or description is empty', () => {
    render(<BugReportDialog open onClose={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /senden/i });
    expect(submitBtn).toBeDisabled();

    const titleInput = screen.getByLabelText(/titel/i);
    fireEvent.change(titleInput, { target: { value: 'Mein Titel' } });
    // Description still empty.
    expect(submitBtn).toBeDisabled();

    const descInput = screen.getByLabelText(/beschreibung/i);
    fireEvent.change(descInput, { target: { value: 'Mein Beschreibungstext' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('switches between Bug and Feature via ToggleButtonGroup', () => {
    render(<BugReportDialog open onClose={vi.fn()} />);

    const bugBtn = screen.getByRole('button', { name: /^bug$/i });
    const featureBtn = screen.getByRole('button', { name: /feature/i });

    // Default: Bug pressed
    expect(bugBtn).toHaveAttribute('aria-pressed', 'true');
    expect(featureBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(featureBtn);
    expect(featureBtn).toHaveAttribute('aria-pressed', 'true');
    expect(bugBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(bugBtn);
    expect(bugBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('hint switch enables debug-logging via setDisplayMessages(true)', () => {
    render(<BugReportDialog open onClose={vi.fn()} />);

    // Switch should be rendered because kind=bug and displayMessages=false.
    const debugSwitch = screen.getByLabelText(/debug-logging aktivieren/i);
    fireEvent.click(debugSwitch);

    expect(setDisplayMessagesMock).toHaveBeenCalledWith(true);
  });

  it('does not render screenshot button when isScreenshotSupported() is false', () => {
    isScreenshotSupportedMock.mockReturnValue(false);
    render(<BugReportDialog open onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /bildschirmaufnahme/i })).not.toBeInTheDocument();
  });

  it('renders screenshot button when isScreenshotSupported() is true', () => {
    isScreenshotSupportedMock.mockReturnValue(true);
    render(<BugReportDialog open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /bildschirmaufnahme/i })).toBeInTheDocument();
  });

  it('shows a capture indicator while the screenshot is being taken', async () => {
    let resolveCapture: (blob: Blob | null) => void = () => {};
    captureScreenshotMock.mockReturnValueOnce(
      new Promise<Blob | null>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    render(<BugReportDialog open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /bildschirmaufnahme/i }));

    // While the dialog is hidden the user must see that a capture is running.
    const indicator = await screen.findByRole('status');
    expect(indicator).toHaveTextContent(/bildschirmaufnahme wird erstellt/i);

    await act(async () => {
      resolveCapture(new Blob(['png-bytes'], { type: 'image/png' }));
    });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('lets the cancel button take focus while the hidden dialog is still mounted', async () => {
    captureScreenshotMock.mockReturnValueOnce(new Promise<Blob | null>(() => {}));
    render(<BugReportDialog open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /bildschirmaufnahme/i }));
    await screen.findByRole('status');

    // The dialog's focus trap must not pull focus back out of the overlay.
    const cancelBtn = screen.getByRole('button', {
      name: /aufnahme abbrechen/i,
    });
    act(() => cancelBtn.focus());
    expect(cancelBtn).toHaveFocus();
  });

  it('cancelling the capture brings the dialog back and discards a late result', async () => {
    let resolveCapture: (blob: Blob | null) => void = () => {};
    captureScreenshotMock.mockReturnValueOnce(
      new Promise<Blob | null>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    render(<BugReportDialog open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /bildschirmaufnahme/i }));
    await screen.findByRole('status');

    fireEvent.click(screen.getByRole('button', { name: /aufnahme abbrechen/i }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    // The capture still finishes in the background; its result is dropped.
    await act(async () => {
      resolveCapture(new Blob(['png-bytes'], { type: 'image/png' }));
    });
    expect(screen.queryByAltText('screenshot-1')).not.toBeInTheDocument();
  });

  it('reports a failed capture via snackbar instead of failing silently', async () => {
    captureScreenshotMock.mockResolvedValueOnce(null);
    render(<BugReportDialog open onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bildschirmaufnahme/i }));
    });

    await waitFor(() => expect(showSnackbarMock).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('recovers from a rejected capture (e.g. lazy chunk not loadable offline)', async () => {
    captureScreenshotMock.mockRejectedValueOnce(new Error('chunk load failed'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<BugReportDialog open onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bildschirmaufnahme/i }));
    });

    await waitFor(() => expect(showSnackbarMock).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('uploads attachments and submits with expected payload; shows success snackbar', async () => {
    const onClose = vi.fn();
    render(<BugReportDialog open onClose={onClose} />);

    // Capture screenshot to add a screenshot Blob.
    const ssBlob = new Blob(['png-bytes'], { type: 'image/png' });
    captureScreenshotMock.mockResolvedValueOnce(ssBlob);
    fireEvent.click(screen.getByRole('button', { name: /bildschirmaufnahme/i }));
    // Wait for the screenshot promise to settle so it is in pendingScreenshots.
    await waitFor(() => expect(captureScreenshotMock).toHaveBeenCalledTimes(1));

    // Fill required fields.
    fireEvent.change(screen.getByLabelText(/titel/i), {
      target: { value: 'Mein Titel' },
    });
    fireEvent.change(screen.getByLabelText(/beschreibung/i), {
      target: { value: 'Mein Beschreibungstext' },
    });

    // Submit.
    const submitBtn = screen.getByRole('button', { name: /senden/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => expect(submitBugReportActionMock).toHaveBeenCalledTimes(1));

    // uploadBugReportFile called once for the screenshot.
    expect(uploadBugReportFileMock).toHaveBeenCalled();
    const uploadCallArgs = uploadBugReportFileMock.mock.calls[0];
    expect(uploadCallArgs[0]).toBe('report-uuid-1');
    expect(uploadCallArgs[1]).toBe(ssBlob);

    // submitBugReportAction payload.
    const payload = submitBugReportActionMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      reportId: 'report-uuid-1',
      kind: 'bug',
      title: 'Mein Titel',
      description: 'Mein Beschreibungstext',
    });
    expect(payload.screenshots).toEqual(['/bugReports/report-uuid-1/uuid-screenshot.png']);
    expect(payload.attachments).toEqual([]);
    expect(payload.logs).toHaveLength(2);
    expect(payload.context).toMatchObject({
      pathname: '/some/path',
      firecallId: 'fc1',
      firecallName: 'Einsatz 1',
    });

    // Snackbar called with 'success'.
    expect(showSnackbarMock).toHaveBeenCalledWith(expect.any(String), 'success');

    // Dialog closed.
    expect(onClose).toHaveBeenCalled();
  });
  it('attaches screenshots taken before the dialog opened (hotkey)', async () => {
    const early = new Blob(['early'], { type: 'image/png' });
    const onClose = vi.fn();
    render(<BugReportDialog open onClose={onClose} initialScreenshots={[early]} />);

    expect(screen.getByAltText('screenshot-1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/titel/i), {
      target: { value: 'T' },
    });
    fireEvent.change(screen.getByLabelText(/beschreibung/i), {
      target: { value: 'D' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /senden/i }));
    });
    await waitFor(() => expect(submitBugReportActionMock).toHaveBeenCalledTimes(1));
    expect(uploadBugReportFileMock.mock.calls[0][1]).toBe(early);
  });

  it('"Bereich auswählen" captures in high resolution, then appends the selected region', async () => {
    const full = new Blob(['full'], { type: 'image/png' });
    captureScreenshotMock.mockResolvedValueOnce(full);
    render(<BugReportDialog open onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bereich auswählen/i }));
    });

    expect(captureScreenshotMock).toHaveBeenCalledWith({ highResolution: true });
    const selector = await screen.findByTestId('region-selector');
    expect(selector).toHaveAttribute('data-mode', 'capture');

    fireEvent.click(screen.getByText('confirm-region'));

    expect(screen.queryByTestId('region-selector')).not.toBeInTheDocument();
    expect(screen.getByAltText('screenshot-1')).toBeInTheDocument();
    expect(showSnackbarMock).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('cancelling the region selection attaches nothing', async () => {
    captureScreenshotMock.mockResolvedValueOnce(new Blob(['full']));
    render(<BugReportDialog open onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bereich auswählen/i }));
    });
    fireEvent.click(await screen.findByText('cancel-region'));

    expect(screen.queryByTestId('region-selector')).not.toBeInTheDocument();
    expect(screen.queryByAltText('screenshot-1')).not.toBeInTheDocument();
  });

  it('crops an attached screenshot in place', async () => {
    const early = new Blob(['early'], { type: 'image/png' });
    render(<BugReportDialog open onClose={vi.fn()} initialScreenshots={[early]} />);

    fireEvent.click(screen.getByRole('button', { name: /screenshot zuschneiden/i }));
    expect(screen.getByTestId('region-selector')).toHaveAttribute('data-mode', 'crop');
    expect(captureScreenshotMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('confirm-region'));

    // Still exactly one screenshot — replaced, not appended.
    expect(screen.getByAltText('screenshot-1')).toBeInTheDocument();
    expect(screen.queryByAltText('screenshot-2')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/titel/i), {
      target: { value: 'T' },
    });
    fireEvent.change(screen.getByLabelText(/beschreibung/i), {
      target: { value: 'D' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /senden/i }));
    });
    await waitFor(() => expect(uploadBugReportFileMock).toHaveBeenCalledTimes(1));
    expect(uploadBugReportFileMock.mock.calls[0][1]).toBe(croppedBlob);
  });

  it('shows the configured shortcuts as a hint', async () => {
    window.localStorage.clear();
    render(
      <HotkeyProvider>
        <BugReportDialog open onClose={vi.fn()} />
      </HotkeyProvider>,
    );

    const hint = await screen.findByTestId('bug-report-shortcut-hint');
    expect(hint).toHaveTextContent(/Alt\+Shift\+B/);
    expect(hint).toHaveTextContent(/Alt\+Shift\+S/);
  });

  it('hides the shortcut hint on touch-only devices', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(
      (query: string) => ({ matches: query.includes('pointer: coarse') }) as MediaQueryList,
    );
    try {
      render(
        <HotkeyProvider>
          <BugReportDialog open onClose={vi.fn()} />
        </HotkeyProvider>,
      );
      expect(screen.queryByTestId('bug-report-shortcut-hint')).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('handles the region hotkey itself while open', async () => {
    window.localStorage.clear();
    captureScreenshotMock.mockResolvedValueOnce(new Blob(['full']));
    render(
      <HotkeyProvider>
        <BugReportDialog open onClose={vi.fn()} />
      </HotkeyProvider>,
    );

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/titel/i), {
        key: 'S',
        code: 'KeyS',
        altKey: true,
        shiftKey: true,
      });
    });

    expect(captureScreenshotMock).toHaveBeenCalledWith({ highResolution: true });
    expect(await screen.findByTestId('region-selector')).toBeInTheDocument();
  });
});
