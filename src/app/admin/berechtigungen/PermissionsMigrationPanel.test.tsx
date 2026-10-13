// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';
import type { PermissionsMigrationState } from './actions';
import { buildMigrationPreview, legacyCleanupStatus } from './permissionsMigration';

const getState = vi.fn();
const migrateUserRoles = vi.fn();
const removeLegacyRoleFields = vi.fn();
const recomputeAllPermissions = vi.fn();

vi.mock('./actions', () => ({
  getPermissionsMigrationState: () => getState(),
  migrateUserRoles: (...args: unknown[]) => migrateUserRoles(...args),
  removeLegacyRoleFields: () => removeLegacyRoleFields(),
  recomputeAllPermissions: () => recomputeAllPermissions(),
}));

import PermissionsMigrationPanel from './PermissionsMigrationPanel';

const users = [
  {
    uid: 'a',
    displayName: 'Max Muster',
    groups: ['ffnd', 'ffwien', 'kostenersatz'],
    groupAdmin: ['ffalt'],
  },
  { uid: 'b', displayName: 'Erika Beispiel', groupRoles: { ffnd: [] } },
];

function state(): PermissionsMigrationState {
  return {
    users: buildMigrationPreview(users),
    cleanup: legacyCleanupStatus(users),
    log: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getState.mockResolvedValue(state());
  migrateUserRoles.mockResolvedValue({});
});

describe('PermissionsMigrationPanel', () => {
  it('zeigt die Vorschau mit Hinweisen und sperrt Schritt 3', async () => {
    renderWithIntl(<PermissionsMigrationPanel />);

    expect(await screen.findByText('Max Muster')).toBeInTheDocument();
    expect(
      screen.getByText('Rolle Gruppen-Admin in ffalt entfällt (kein Mitglied)'),
    ).toBeInTheDocument();
    // Migrierte Benutzer sind standardmäßig ausgeblendet.
    expect(screen.queryByText('Erika Beispiel')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Alte Felder entfernen' }),
    ).toBeDisabled();
  });

  it('übergibt die geänderten Kostenersatz-Häkchen an die Migration', async () => {
    const user = userEvent.setup();
    renderWithIntl(<PermissionsMigrationPanel />);

    const ffwien = await screen.findByRole('checkbox', { name: 'ffwien' });
    expect(ffwien).toBeChecked();
    await user.click(ffwien);
    expect(screen.getByText('ffwien: Mitglied ohne Rolle')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1 Benutzer migrieren' }));
    await user.click(screen.getByRole('button', { name: 'Ausführen' }));

    await waitFor(() =>
      expect(migrateUserRoles).toHaveBeenCalledWith({ a: ['ffnd'] }),
    );
    expect(getState).toHaveBeenCalledTimes(2);
  });
});
