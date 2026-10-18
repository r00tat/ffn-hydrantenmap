// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const exportFirecallMock = vi.fn();
const countBackupSectionsMock = vi.fn();
const downloadBlobMock = vi.fn();
const showSnackbarMock = vi.fn();

vi.mock('../../hooks/useExport', () => ({
  BACKUP_SECTIONS: ['history', 'auditlog', 'attachments'],
  exportFirecall: (...args: unknown[]) => exportFirecallMock(...args),
  countBackupSections: (...args: unknown[]) => countBackupSectionsMock(...args),
}));

vi.mock('./download', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlobMock(...args),
}));

vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

import FirecallExport from './FirecallExport';

async function openDialog() {
  await userEvent.click(screen.getByRole('button'));
  return screen.findByRole('dialog');
}

describe('FirecallExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportFirecallMock.mockResolvedValue({ name: 'Übung' });
    countBackupSectionsMock.mockResolvedValue({ history: 120, auditlog: 4500 });
    downloadBlobMock.mockResolvedValue(undefined);
  });

  it('fragt erst, was in die Sicherung soll, statt sofort zu exportieren', async () => {
    renderWithIntl(<FirecallExport firecallId="fc1" />);

    await openDialog();

    expect(exportFirecallMock).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /Verlauf/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Audit-Log/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Dateianhänge/ })).toBeChecked();
  });

  it('zeigt die Größe von Verlauf und Audit-Log', async () => {
    renderWithIntl(<FirecallExport firecallId="fc1" />);

    await openDialog();

    expect(await screen.findByText(/120 Einträge/)).toBeInTheDocument();
    expect(screen.getByText(/4\.500 Einträge/)).toBeInTheDocument();
    expect(countBackupSectionsMock).toHaveBeenCalledWith('fc1');
  });

  it('exportiert vollständig, wenn nichts abgewählt wird', async () => {
    renderWithIntl(<FirecallExport firecallId="fc1" />);
    await openDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));

    await waitFor(() => expect(downloadBlobMock).toHaveBeenCalled());
    expect(exportFirecallMock).toHaveBeenCalledWith(
      'fc1',
      expect.objectContaining({ omit: [] })
    );
  });

  it('lässt abgewählte Teile weg', async () => {
    renderWithIntl(<FirecallExport firecallId="fc1" />);
    await openDialog();

    await userEvent.click(screen.getByRole('checkbox', { name: /Verlauf/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Dateianhänge/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));

    await waitFor(() => expect(downloadBlobMock).toHaveBeenCalled());
    expect(exportFirecallMock).toHaveBeenCalledWith(
      'fc1',
      expect.objectContaining({ omit: ['history', 'attachments'] })
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('exportiert beim Abbrechen nichts', async () => {
    renderWithIntl(<FirecallExport firecallId="fc1" />);
    await openDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(exportFirecallMock).not.toHaveBeenCalled();
  });
});
