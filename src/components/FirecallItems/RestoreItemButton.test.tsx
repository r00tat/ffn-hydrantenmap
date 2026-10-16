// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';

const restoreMock = vi.fn();
const editor = { canWrite: true, historyModeActive: false, historyId: '' };

vi.mock('../../hooks/useMapEditor', () => ({ default: () => editor }));
vi.mock('../../hooks/useFirecallItemRestore', () => ({
  default: () => restoreMock,
}));
vi.mock('../providers/SnackbarProvider', () => ({ useSnackbar: () => vi.fn() }));

const { default: RestoreItemButton } = await import('./RestoreItemButton');

const marker = { id: 'm1', type: 'marker', name: 'Gefahrenstelle' };

describe('RestoreItemButton', () => {
  beforeEach(() => {
    restoreMock.mockReset();
    restoreMock.mockResolvedValue(undefined);
    Object.assign(editor, {
      canWrite: true,
      historyModeActive: false,
      historyId: '',
    });
  });

  it('fehlt am aktuellen Stand eines nicht gelöschten Elements', () => {
    render(<RestoreItemButton item={marker} />);
    expect(screen.queryByLabelText('Wiederherstellen')).not.toBeInTheDocument();
  });

  it('fehlt ohne Schreibrecht', () => {
    Object.assign(editor, { canWrite: false, historyModeActive: true });
    render(<RestoreItemButton item={marker} />);
    expect(screen.queryByLabelText('Wiederherstellen')).not.toBeInTheDocument();
  });

  it('holt im Verlauf den Stand des Snapshots zurück', async () => {
    Object.assign(editor, { historyModeActive: true, historyId: 'h1' });
    render(<RestoreItemButton item={marker} />);

    await userEvent.click(screen.getByLabelText('Wiederherstellen'));
    await userEvent.click(screen.getByRole('button', { name: 'ja' }));

    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith(marker, { historyId: 'h1' }));
  });

  it('stellt ein gelöschtes Element ohne Snapshot wieder her', async () => {
    const deleted = { ...marker, deleted: true };
    render(<RestoreItemButton item={deleted} />);

    await userEvent.click(screen.getByLabelText('Wiederherstellen'));
    await userEvent.click(screen.getByRole('button', { name: 'ja' }));

    await waitFor(() =>
      expect(restoreMock).toHaveBeenCalledWith(deleted, {
        historyId: undefined,
      }),
    );
  });
});
