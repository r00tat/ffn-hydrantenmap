// @vitest-environment jsdom
import Dialog from '@mui/material/Dialog';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import HotkeyProvider from '../hotkeys/HotkeyProvider';

vi.mock('server-only', () => ({}));

vi.mock('./BugReportDialog', () => ({
  __esModule: true,
  default: ({
    open,
    initialScreenshots,
  }: {
    open: boolean;
    onClose: () => void;
    initialScreenshots?: Blob[];
  }) =>
    open ? (
      <div data-testid="bug-dialog">
        screenshots:{initialScreenshots?.length ?? 0}
        {initialScreenshots?.map((b, i) => (
          <span key={i} data-testid="initial-screenshot">
            {(b as Blob & { label?: string }).label}
          </span>
        ))}
      </div>
    ) : null,
}));

const captureScreenshotMock = vi.fn();
vi.mock('./captureScreenshot', () => ({
  captureScreenshot: (...args: unknown[]) => captureScreenshotMock(...args),
  isScreenshotSupported: () => true,
}));

vi.mock('./RegionSelector', () => ({
  __esModule: true,
  default: ({
    open,
    image,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    image: Blob | null;
    onConfirm: (b: Blob) => void;
    onCancel: () => void;
  }) =>
    open && image ? (
      <div data-testid="region-selector">
        <button
          type="button"
          onClick={() => onConfirm(Object.assign(new Blob(['crop']), { label: 'cropped' }))}
        >
          confirm-region
        </button>
        <button type="button" onClick={() => onConfirm(image)}>
          full-region
        </button>
        <button type="button" onClick={onCancel}>
          cancel-region
        </button>
      </div>
    ) : null,
}));

const showSnackbarMock = vi.fn();
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

import BugReportProvider, { useBugReport } from './BugReportProvider';

function Consumer() {
  const { open } = useBugReport();
  return (
    <button type="button" onClick={open}>
      open-bug-report
    </button>
  );
}

function renderProvider(children: React.ReactNode = <Consumer />) {
  return render(
    <HotkeyProvider>
      <BugReportProvider>{children}</BugReportProvider>
    </HotkeyProvider>,
  );
}

function pressOpenHotkey() {
  fireEvent.keyDown(window, {
    key: 'B',
    code: 'KeyB',
    altKey: true,
    shiftKey: true,
  });
}

function pressRegionHotkey() {
  fireEvent.keyDown(window, {
    key: 'S',
    code: 'KeyS',
    altKey: true,
    shiftKey: true,
  });
}

function labelled(label: string): Blob {
  return Object.assign(new Blob([label], { type: 'image/png' }), { label });
}

describe('BugReportProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    captureScreenshotMock.mockReset();
    showSnackbarMock.mockReset();
  });

  it('opens the dialog without screenshot when the consumer calls open()', () => {
    renderProvider();

    expect(screen.queryByTestId('bug-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('open-bug-report'));
    expect(screen.getByTestId('bug-dialog')).toHaveTextContent('screenshots:0');
    expect(captureScreenshotMock).not.toHaveBeenCalled();
  });

  it('provides a noop default outside of the provider', () => {
    render(<Consumer />);
    expect(() => fireEvent.click(screen.getByText('open-bug-report'))).not.toThrow();
  });

  it('bugReport.open captures first, then opens with the screenshot attached', async () => {
    let resolveCapture: (b: Blob | null) => void = () => {};
    captureScreenshotMock.mockReturnValueOnce(
      new Promise<Blob | null>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    renderProvider();

    act(() => pressOpenHotkey());

    // Capture feedback is shown and the dialog is not open yet, so it is not
    // part of the screenshot.
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('bug-dialog')).not.toBeInTheDocument();
    expect(captureScreenshotMock).toHaveBeenCalledWith({ highResolution: false });

    await act(async () => resolveCapture(labelled('full')));

    expect(screen.getByTestId('bug-dialog')).toHaveTextContent('screenshots:1');
    expect(screen.getByTestId('initial-screenshot')).toHaveTextContent('full');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('works while another dialog is open and leaves that dialog open', async () => {
    captureScreenshotMock.mockResolvedValueOnce(labelled('full'));
    renderProvider(
      <Dialog open>
        <input aria-label="other-field" />
      </Dialog>,
    );
    // Focus inside an input of the other dialog — the hotkey still fires.
    screen.getByLabelText('other-field').focus();

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('other-field'), {
        key: 'B',
        code: 'KeyB',
        altKey: true,
        shiftKey: true,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId('bug-dialog')).toHaveTextContent('screenshots:1'),
    );
    expect(screen.getByLabelText('other-field', { selector: 'input' })).toBeInTheDocument();
  });

  it('still opens the dialog when the capture fails, and says so', async () => {
    captureScreenshotMock.mockResolvedValueOnce(null);
    renderProvider();

    await act(async () => pressOpenHotkey());

    await waitFor(() =>
      expect(screen.getByTestId('bug-dialog')).toHaveTextContent('screenshots:0'),
    );
    expect(showSnackbarMock).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('cancelling the capture opens nothing, even if the capture finishes later', async () => {
    let resolveCapture: (b: Blob | null) => void = () => {};
    captureScreenshotMock.mockReturnValueOnce(
      new Promise<Blob | null>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    renderProvider();

    act(() => pressOpenHotkey());
    fireEvent.click(await screen.findByRole('button', { name: /aufnahme abbrechen/i }));
    await act(async () => resolveCapture(labelled('late')));

    expect(screen.queryByTestId('bug-dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does nothing when the bug dialog is already open', async () => {
    renderProvider();
    fireEvent.click(screen.getByText('open-bug-report'));

    await act(async () => pressOpenHotkey());

    expect(captureScreenshotMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('bug-dialog')).toHaveTextContent('screenshots:0');
  });

  it('bugReport.region captures in high resolution and opens with the selected region', async () => {
    captureScreenshotMock.mockResolvedValueOnce(labelled('full'));
    renderProvider();

    await act(async () => pressRegionHotkey());

    expect(captureScreenshotMock).toHaveBeenCalledWith({ highResolution: true });
    expect(await screen.findByTestId('region-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('bug-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('confirm-region'));

    expect(screen.queryByTestId('region-selector')).not.toBeInTheDocument();
    expect(screen.getByTestId('initial-screenshot')).toHaveTextContent('cropped');
  });

  it('"Ganzer Bildschirm" in the selector attaches the uncropped capture', async () => {
    captureScreenshotMock.mockResolvedValueOnce(labelled('full'));
    renderProvider();

    await act(async () => pressRegionHotkey());
    fireEvent.click(await screen.findByText('full-region'));

    expect(screen.getByTestId('initial-screenshot')).toHaveTextContent('full');
  });

  it('cancelling the selector opens nothing', async () => {
    captureScreenshotMock.mockResolvedValueOnce(labelled('full'));
    renderProvider();

    await act(async () => pressRegionHotkey());
    fireEvent.click(await screen.findByText('cancel-region'));

    expect(screen.queryByTestId('region-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bug-dialog')).not.toBeInTheDocument();
  });

  it('ignores a second hotkey press while a capture is running', async () => {
    captureScreenshotMock.mockReturnValue(new Promise<Blob | null>(() => {}));
    renderProvider();

    act(() => pressRegionHotkey());
    act(() => pressOpenHotkey());

    expect(captureScreenshotMock).toHaveBeenCalledTimes(1);
  });
});
