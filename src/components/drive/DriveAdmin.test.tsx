// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const getDriveConfig = vi.fn();
const saveDriveConfig = vi.fn();
const checkDriveFolder = vi.fn();

vi.mock('./driveConfigActions', () => ({
  getDriveConfig: (...a: unknown[]) => getDriveConfig(...a),
  saveDriveConfig: (...a: unknown[]) => saveDriveConfig(...a),
  checkDriveFolder: (...a: unknown[]) => checkDriveFolder(...a),
}));
vi.mock('../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));

import DriveAdmin from './DriveAdmin';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DriveAdmin', () => {
  it('loads the configured folder id', async () => {
    getDriveConfig.mockResolvedValue({
      groupId: 'ffnd',
      baseFolderId: 'abc123',
    });
    renderWithIntl(<DriveAdmin />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('abc123')).toBeInTheDocument(),
    );
  });

  it('keeps saving disabled when loading failed, so an empty field cannot overwrite', async () => {
    getDriveConfig.mockRejectedValue(new Error('boom'));
    renderWithIntl(<DriveAdmin />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('saves the entered folder id', async () => {
    getDriveConfig.mockResolvedValue(null);
    saveDriveConfig.mockResolvedValue(undefined);
    renderWithIntl(<DriveAdmin />);
    const field = await screen.findByLabelText(/ordner-id/i);
    await userEvent.type(field, 'xyz');
    await userEvent.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() =>
      expect(saveDriveConfig).toHaveBeenCalledWith('ffnd', 'xyz'),
    );
  });
});
