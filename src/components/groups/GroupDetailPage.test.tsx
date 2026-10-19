// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const {
  firebaseLoginMock,
  getMock,
  setRoleMock,
  addMock,
  removeMock,
  editMock,
} = vi.hoisted(() => ({
    editMock: vi.fn(),
    firebaseLoginMock: vi.fn(),
    getMock: vi.fn(),
    setRoleMock: vi.fn(),
    addMock: vi.fn(),
    removeMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));
vi.mock('../../app/groups/GroupAction', () => ({
  getGroupsAction: async () => [
    { id: 'abschnitt', name: 'Abschnitt Nord' },
    {
      id: 'ffnd',
      name: 'FF Neusiedl am See',
      description: 'Feuerwehrhaus',
      parentId: 'abschnitt',
    },
    { id: 'zug1', name: 'Zug 1', parentId: 'ffnd' },
  ],
}));
vi.mock('../../app/users/action', () => ({ getUsers: async () => [] }));
vi.mock('./useGroupEditor', () => ({
  default: () => ({ edit: editMock, dialog: null }),
}));
vi.mock('../../app/groups/memberRolesActions', () => ({
  getMemberRolesAction: (groupId: string) => getMock(groupId),
  setMemberRoleAction: (...args: unknown[]) => setRoleMock(...args),
  addMemberAction: (...args: unknown[]) => addMock(...args),
  removeMemberAction: (...args: unknown[]) => removeMock(...args),
}));

import GroupDetailPage from './GroupDetailPage';

const DATA = {
  groupName: 'FF Neusiedl am See',
  members: [
    {
      uid: 'u1',
      displayName: 'Anna Beispiel',
      email: 'anna@example.org',
      roles: ['geraetemeister'],
      migrated: true,
    },
  ],
  candidates: [],
  assignable: {
    gruppenadmin: false,
    geraetemeister: true,
    bekleidungswart: true,
    kostenersatz: false,
    kennzeichenabfrage: false,
  },
  canManageMembers: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  firebaseLoginMock.mockReturnValue({
    isAuthorized: true,
    groupRoles: { ffnd: ['gruppenadmin'] },
  });
  getMock.mockResolvedValue(DATA);
  setRoleMock.mockResolvedValue({
    success: true,
    roles: ['bekleidungswart', 'geraetemeister'],
  });
});

describe('GroupDetailPage', () => {
  it('zeigt die Matrix und sperrt Rollen, die der Gruppen-Admin nicht vergeben darf', async () => {
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    const geraetemeister = await screen.findByRole('checkbox', {
      name: 'Gerätemeister für Anna Beispiel',
    });
    expect(geraetemeister).toBeChecked();
    expect(geraetemeister).toBeEnabled();
    // Gesperrte Kästchen tragen dasselbe Label; der Tooltip erklärt warum.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.filter((b) => (b as HTMLInputElement).disabled)).toHaveLength(3);
    // Aufnehmen und Entfernen gibt es nur für den globalen Admin.
    expect(screen.queryByRole('button', { name: /Aufnehmen/ })).toBeNull();
    expect(getMock).toHaveBeenCalledWith('ffnd');
  });

  it('vergibt eine Rolle über die Server Action', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Bekleidungswart für Anna Beispiel',
      }),
    );

    expect(setRoleMock).toHaveBeenCalledWith('ffnd', 'u1', 'bekleidungswart', true);
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Bekleidungswart für Anna Beispiel' }),
      ).toBeChecked(),
    );
  });

  it('meldet eine abgelehnte Änderung', async () => {
    setRoleMock.mockResolvedValue({ success: false, error: 'forbidden' });
    const user = userEvent.setup();
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Bekleidungswart für Anna Beispiel',
      }),
    );

    expect(
      await screen.findByText('Diese Rolle darfst du nicht vergeben oder entziehen.'),
    ).toBeInTheDocument();
  });

  it('weist ohne rollen.assign ab, ohne zu laden', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      groupRoles: { ffnd: ['geraetemeister'] },
    });

    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    expect(
      screen.getByText('Du darfst in dieser Gruppe keine Rollen vergeben.'),
    ).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('erklärt die Rollen aus dem Katalog', async () => {
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    expect(await screen.findByText('Was die Rollen dürfen')).toBeInTheDocument();
    expect(screen.getAllByText('Rollen vergeben').length).toBeGreaterThan(0);
  });

  it('zeigt die Lage im Baum mit Weg zurück zur Übersicht', async () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: true,
      groupRoles: {},
    });
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    const nav = await screen.findByRole('navigation', { name: 'Navigation' });
    expect(nav).toHaveTextContent('Gruppen');
    expect(screen.getByRole('link', { name: 'Gruppen' })).toHaveAttribute(
      'href',
      '/groups',
    );
    expect(
      (await screen.findAllByRole('link', { name: 'Abschnitt Nord' }))[0],
    ).toHaveAttribute('href', '/groups/abschnitt');
    expect(screen.getByRole('link', { name: 'Zug 1' })).toHaveAttribute(
      'href',
      '/groups/zug1',
    );
    expect(screen.getByText('Feuerwehrhaus')).toBeInTheDocument();
  });

  it('öffnet für den Admin den Gruppendialog', async () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: true,
      groupRoles: {},
    });
    const user = userEvent.setup();
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    await user.click(
      await screen.findByRole('button', { name: 'Gruppe bearbeiten' }),
    );
    expect(editMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ffnd' }),
    );
  });

  it('zeigt dem Gruppen-Admin keinen Bearbeiten-Knopf', async () => {
    renderWithIntl(<GroupDetailPage groupId="ffnd" />);

    await screen.findByRole('link', { name: 'Zug 1' });
    expect(screen.queryByRole('button', { name: 'Gruppe bearbeiten' })).toBeNull();
  });
});
