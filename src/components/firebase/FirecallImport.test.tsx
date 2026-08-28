// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const importFirecallMock = vi.fn();
const showSnackbarMock = vi.fn();

vi.mock('../../hooks/useExport', () => ({
  importFirecall: (...args: unknown[]) => importFirecallMock(...args),
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({
    myGroups: [
      { id: 'ffnd', name: 'FF Neusiedl am See' },
      { id: 'ffpodersdorf', name: 'FF Podersdorf' },
      // Pseudo-Gruppe — darf nicht als Zielgruppe angeboten werden
      { id: 'allUsers', name: 'Alle Benutzer' },
    ],
  }),
}));

vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

import FirecallImport from './FirecallImport';

const backup = {
  name: 'B1 Neusiedl',
  group: 'ffnd',
  items: [],
  chat: [],
  layers: [],
  history: [],
  locations: [],
  kostenersatz: [],
  auditlog: [],
};

function backupFile(content: unknown = backup) {
  return new File([JSON.stringify(content)], 'firecall-export.json', {
    type: 'application/json',
  });
}

async function chooseFile(file: File) {
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  await userEvent.upload(input, file);
}

describe('FirecallImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importFirecallMock.mockResolvedValue({ id: 'new-id' });
  });

  it('asks for the target group before importing', async () => {
    renderWithIntl(<FirecallImport />);

    await chooseFile(backupFile());

    expect(await screen.findByText(/B1 Neusiedl/)).toBeInTheDocument();
    expect(importFirecallMock).not.toHaveBeenCalled();
  });

  it('offers only real brigades as target group', async () => {
    renderWithIntl(<FirecallImport />);
    await chooseFile(backupFile());

    await userEvent.click(await screen.findByRole('combobox'));

    expect(
      screen.getByRole('option', { name: 'FF Podersdorf' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Alle Benutzer' })
    ).not.toBeInTheDocument();
  });

  it('imports into the chosen group', async () => {
    renderWithIntl(<FirecallImport />);
    await chooseFile(backupFile());

    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'FF Podersdorf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Importieren' }));

    await waitFor(() => expect(importFirecallMock).toHaveBeenCalledTimes(1));
    const [data, options] = importFirecallMock.mock.calls[0];
    expect(options.group).toBe('ffpodersdorf');
    expect(data.name).toMatch(/^B1 Neusiedl Kopie /);
  });

  it('defaults to the group from the file', async () => {
    renderWithIntl(<FirecallImport />);
    await chooseFile(backupFile());

    await userEvent.click(
      await screen.findByRole('button', { name: 'Importieren' })
    );

    await waitFor(() => expect(importFirecallMock).toHaveBeenCalledTimes(1));
    expect(importFirecallMock.mock.calls[0][1].group).toBe('ffnd');
  });

  it('reports a broken file instead of opening the dialog', async () => {
    renderWithIntl(<FirecallImport />);

    await chooseFile(
      new File(['not json'], 'broken.json', { type: 'application/json' })
    );

    await waitFor(() =>
      expect(showSnackbarMock).toHaveBeenCalledWith(
        expect.stringContaining('keine gültige'),
        'error'
      )
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('surfaces warnings raised during the import', async () => {
    (importFirecallMock as Mock).mockImplementation(
      async (
        _data: unknown,
        options: { onWarning?: (w: unknown) => void }
      ) => {
        options.onWarning?.({
          code: 'attachmentUploadFailed',
          file: 'plan.pdf',
        });
        return { id: 'new-id' };
      }
    );

    renderWithIntl(<FirecallImport />);
    await chooseFile(backupFile());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Importieren' })
    );

    await waitFor(() =>
      expect(showSnackbarMock).toHaveBeenCalledWith(
        expect.stringContaining('plan.pdf'),
        'warning'
      )
    );
  });

  it('reports a failed import', async () => {
    importFirecallMock.mockRejectedValue(new Error('permission denied'));

    renderWithIntl(<FirecallImport />);
    await chooseFile(backupFile());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Importieren' })
    );

    await waitFor(() =>
      expect(showSnackbarMock).toHaveBeenCalledWith(
        expect.stringContaining('permission denied'),
        'error'
      )
    );
  });
});
