// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';

const mocks = vi.hoisted(() => ({
  online: true,
  uploadBytesResumable: vi.fn(),
  queueUpload: vi.fn(async (..._args: unknown[]) => ({})),
  pending: [] as { id: string; fileName: string; storagePath: string }[],
  showSnackbar: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: (_s: unknown, path: string) => ({ fullPath: path, name: path }),
  uploadBytesResumable: mocks.uploadBytesResumable,
}));
vi.mock('../firebase/firebase', () => ({ default: {} }));
vi.mock('../../hooks/useFirecall', () => ({ useFirecallId: () => 'fc1' }));
vi.mock('../../hooks/useOnline', () => ({ default: () => mocks.online }));
vi.mock('../../lib/connectivity', () => ({
  checkConnectivityNow: async () => mocks.online,
}));
vi.mock('../../lib/uploadQueue', () => ({
  queueUpload: mocks.queueUpload,
  usePendingUploads: () => mocks.pending,
}));
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => mocks.showSnackbar,
}));

import FileUploader from './FileUploader';

const target = { docPath: 'call/fc1', field: 'attachments' };

function pickFile(name = 'foto.jpg') {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const file = new File(['x'], name, { type: 'image/jpeg' });
  return userEvent.upload(input, file);
}

describe('FileUploader offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.online = true;
    mocks.pending = [];
  });

  it('reiht die Datei offline mit Ziel ein, statt hochzuladen', async () => {
    mocks.online = false;
    const onComplete = vi.fn();
    render(
      <FileUploader onFileUploadComplete={onComplete} offlineTarget={target} />,
    );

    await pickFile();

    await waitFor(() => expect(mocks.queueUpload).toHaveBeenCalledTimes(1));
    const payload = mocks.queueUpload.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      fileName: 'foto.jpg',
      contentType: 'image/jpeg',
      target,
    });
    expect(payload.storagePath).toMatch(/^\/firecall\/fc1\/files\/.+-foto\.jpg$/);
    expect(mocks.uploadBytesResumable).not.toHaveBeenCalled();
    // Die Referenz kommt erst nach dem Upload ins Dokument — nicht jetzt.
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.showSnackbar).toHaveBeenCalledWith(
      expect.stringContaining('sobald die Verbindung'),
      'info',
    );
  });

  it('zeigt wartende Uploads als Platzhalter', () => {
    mocks.pending = [{ id: 'p1', fileName: 'foto.jpg', storagePath: 'p1' }];
    render(<FileUploader onFileUploadComplete={vi.fn()} offlineTarget={target} />);
    expect(screen.getByText('foto.jpg – wartet auf Upload')).toBeInTheDocument();
  });

  it('ist offline ohne Ziel deaktiviert', () => {
    mocks.online = false;
    render(<FileUploader onFileUploadComplete={vi.fn()} />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});
