// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const getFirecallDriveState = vi.fn();
// Bewusst nicht `useXxx` benannt: sonst hält react-hooks/rules-of-hooks die
// Mock-Fabrik für eine Komponente, die einen Hook aufruft.
const firebaseLoginMock = vi.fn();
const firecallWriteAccessMock = vi.fn();

vi.mock('./driveFileActions', () => ({
  getFirecallDriveState: (...a: unknown[]) => getFirecallDriveState(...a),
}));
vi.mock('./DriveFileUploader', () => ({
  default: () => <button type="button">upload</button>,
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));
vi.mock('../../hooks/useFirecallWriteAccess', () => ({
  default: () => firecallWriteAccessMock(),
}));

import EinsatzDriveFotos from './EinsatzDriveFotos';

beforeEach(() => {
  vi.clearAllMocks();
  firebaseLoginMock.mockReturnValue({ isAdmin: false });
  firecallWriteAccessMock.mockReturnValue(true);
});

describe('EinsatzDriveFotos', () => {
  it('stays invisible for non-admins when no drive is configured', async () => {
    getFirecallDriveState.mockResolvedValue({
      configured: false,
      folderName: '2026-08-16_Test',
      files: [],
    });
    const { container } = renderWithIntl(<EinsatzDriveFotos firecallId="fc1" />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('points admins at the configuration', async () => {
    firebaseLoginMock.mockReturnValue({ isAdmin: true });
    getFirecallDriveState.mockResolvedValue({
      configured: false,
      folderName: '2026-08-16_Test',
      files: [],
    });
    renderWithIntl(<EinsatzDriveFotos firecallId="fc1" />);
    expect(await screen.findByRole('link', { name: /admin/i })).toHaveAttribute(
      'href',
      '/admin/drive',
    );
  });

  it('names the target folder in the explanation', async () => {
    getFirecallDriveState.mockResolvedValue({
      configured: true,
      folderName: '2026-08-16_Zimmerbrand Hauptstraße',
      files: [],
    });
    renderWithIntl(<EinsatzDriveFotos firecallId="fc1" />);
    expect(
      await screen.findByText(/2026-08-16_Zimmerbrand Hauptstraße/),
    ).toBeInTheDocument();
  });

  it('renders thumbnails through the proxy route', async () => {
    getFirecallDriveState.mockResolvedValue({
      configured: true,
      folderName: '2026-08-16_Test',
      folderId: 'folder1',
      folderUrl: 'https://drive/folder1',
      files: [
        {
          id: 'f1',
          name: 'IMG_1.jpg',
          mimeType: 'image/jpeg',
          webViewLink: 'https://drive/f1',
        },
      ],
    });
    renderWithIntl(<EinsatzDriveFotos firecallId="fc1" />);
    const img = await screen.findByAltText('IMG_1.jpg');
    expect(img).toHaveAttribute('src', '/api/einsatz/fc1/drive/f1/thumbnail');
  });

  it('hides the uploader without write access', async () => {
    firecallWriteAccessMock.mockReturnValue(false);
    getFirecallDriveState.mockResolvedValue({
      configured: true,
      folderName: '2026-08-16_Test',
      files: [],
    });
    renderWithIntl(<EinsatzDriveFotos firecallId="fc1" />);
    await screen.findByText(/2026-08-16_Test/);
    expect(screen.queryByRole('button', { name: 'upload' })).toBeNull();
  });
});
