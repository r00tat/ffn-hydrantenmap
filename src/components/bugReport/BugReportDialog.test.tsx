// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('server-only', () => ({}));

// --- Mocks for module-level dependencies -------------------------------------

const captureScreenshotMock = vi.fn();
const isScreenshotSupportedMock = vi.fn(() => true);
vi.mock('./captureScreenshot', () => ({
  captureScreenshot: () => captureScreenshotMock(),
  isScreenshotSupported: () => isScreenshotSupportedMock(),
}));

const uploadBugReportFileMock = vi.fn();
vi.mock('./uploadBugReportFile', () => ({
  uploadBugReportFile: (...args: unknown[]) => uploadBugReportFileMock(...args),
}));

const submitBugReportActionMock = vi.fn();
vi.mock('./submitBugReportAction', () => ({
  submitBugReportAction: (...args: unknown[]) =>
    submitBugReportActionMock(...args),
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

// --- Import after mocks ------------------------------------------------------
import BugReportDialog from './BugReportDialog';

describe('BugReportDialog', () => {
  beforeEach(() => {
    captureScreenshotMock.mockReset();
    isScreenshotSupportedMock.mockReset();
    isScreenshotSupportedMock.mockReturnValue(true);
    uploadBugReportFileMock.mockReset();
    uploadBugReportFileMock.mockImplementation(
      async (_id: string, _blob: Blob, name: string) =>
        `/bugReports/report-uuid-1/uuid-${name}`,
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

    expect(
      screen.queryByRole('button', { name: /bildschirmaufnahme/i }),
    ).not.toBeInTheDocument();
  });

  it('renders screenshot button when isScreenshotSupported() is true', () => {
    isScreenshotSupportedMock.mockReturnValue(true);
    render(<BugReportDialog open onClose={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /bildschirmaufnahme/i }),
    ).toBeInTheDocument();
  });

  it('uploads attachments and submits with expected payload; shows success snackbar', async () => {
    const onClose = vi.fn();
    render(<BugReportDialog open onClose={onClose} />);

    // Capture screenshot to add a screenshot Blob.
    const ssBlob = new Blob(['png-bytes'], { type: 'image/png' });
    captureScreenshotMock.mockResolvedValueOnce(ssBlob);
    fireEvent.click(
      screen.getByRole('button', { name: /bildschirmaufnahme/i }),
    );
    // Wait for the screenshot promise to settle so it is in pendingScreenshots.
    await waitFor(() =>
      expect(captureScreenshotMock).toHaveBeenCalledTimes(1),
    );

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

    await waitFor(() =>
      expect(submitBugReportActionMock).toHaveBeenCalledTimes(1),
    );

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
    expect(payload.screenshots).toEqual([
      '/bugReports/report-uuid-1/uuid-screenshot.png',
    ]);
    expect(payload.attachments).toEqual([]);
    expect(payload.logs).toHaveLength(2);
    expect(payload.context).toMatchObject({
      pathname: '/some/path',
      firecallId: 'fc1',
      firecallName: 'Einsatz 1',
    });

    // Snackbar called with 'success'.
    expect(showSnackbarMock).toHaveBeenCalledWith(
      expect.any(String),
      'success',
    );

    // Dialog closed.
    expect(onClose).toHaveBeenCalled();
  });
});
