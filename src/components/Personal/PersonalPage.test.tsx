// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const firebaseLoginMock = vi.fn();
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));

vi.mock('../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [
      { id: 'ffnd', name: 'FF Neusiedl' },
      { id: 'ffxy', name: 'FF Anderswo' },
    ],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));

// Die Liste selbst ist in PersonalAdmin.test.tsx getestet und zöge hier
// Firestore-Listener nach sich.
vi.mock('./PersonalAdmin', () => ({
  default: ({ groupId }: { groupId: string }) => <div>PersonalAdmin {groupId}</div>,
}));

import PersonalPage from './PersonalPage';

beforeEach(() => vi.clearAllMocks());

describe('PersonalPage', () => {
  it('zeigt dem Gruppen-Admin die Personalliste seiner Gruppe', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      groupRoles: { ffnd: ['gruppenadmin'] },
    });

    renderWithIntl(<PersonalPage />);

    expect(screen.getByText('PersonalAdmin ffnd')).toBeInTheDocument();
    expect(screen.getByText('FF Neusiedl')).toBeInTheDocument();
    expect(screen.queryByText('FF Anderswo')).toBeNull();
  });

  it('lässt den Gerätemeister an das Personal', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      groupRoles: { ffnd: ['geraetemeister'] },
    });

    renderWithIntl(<PersonalPage />);

    expect(screen.getByText('PersonalAdmin ffnd')).toBeInTheDocument();
  });

  it('sperrt ein einfaches Gruppenmitglied aus', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      groupRoles: { ffnd: [] },
    });

    renderWithIntl(<PersonalPage />);

    expect(screen.queryByText(/PersonalAdmin/)).toBeNull();
    expect(
      screen.getByText('Du hast keine Berechtigung für diese Seite.'),
    ).toBeInTheDocument();
  });
});
