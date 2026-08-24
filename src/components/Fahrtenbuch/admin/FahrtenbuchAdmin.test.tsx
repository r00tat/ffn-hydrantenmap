// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

const firebaseLoginMock = vi.fn();
vi.mock('../../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));

vi.mock('../../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [
      { id: 'ffnd', name: 'FF Neusiedl' },
      { id: 'ffxy', name: 'FF Anderswo' },
    ],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));

// Die Reiterinhalte sind hier nicht Gegenstand des Tests und ziehen sonst
// Firestore-Listener nach sich.
vi.mock('./VehicleAdmin', () => ({ default: () => <div>VehicleAdmin</div> }));
vi.mock('./PersonAdmin', () => ({ default: () => <div>PersonAdmin</div> }));
vi.mock('./GroupSettings', () => ({ default: () => <div>GroupSettings</div> }));
vi.mock('./MangelNotificationSettings', () => ({ default: () => <div /> }));
vi.mock('./WeeklyReportSendSection', () => ({ default: () => <div /> }));
vi.mock('./MangelMigration', () => ({ default: () => <div /> }));
vi.mock('./GeraetemeisterSettings', () => ({ default: () => <div /> }));
vi.mock('./ShareLinkSection', () => ({ default: () => <div /> }));
vi.mock('./FahrtenbuchImport', () => ({ default: () => <div /> }));

import FahrtenbuchAdmin from './FahrtenbuchAdmin';

beforeEach(() => vi.clearAllMocks());

describe('FahrtenbuchAdmin Zugang', () => {
  it('zeigt dem Admin alle fünf Reiter', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: true,
      myGroups: [],
    });

    renderWithIntl(<FahrtenbuchAdmin />);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('zeigt dem Gerätemeister nur Fahrzeuge und Personen', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      fahrtenbuchGeraetemeister: ['ffnd'],
      myGroups: [],
    });

    renderWithIntl(<FahrtenbuchAdmin />);

    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('zeigt dem Gerätemeister nur seine Gruppen im Umschalter', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      fahrtenbuchGeraetemeister: ['ffnd'],
      myGroups: [],
    });

    renderWithIntl(<FahrtenbuchAdmin />);

    expect(screen.getByText('FF Neusiedl')).toBeInTheDocument();
    expect(screen.queryByText('FF Anderswo')).toBeNull();
  });

  it('sperrt einen Benutzer ohne Rolle aus', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      myGroups: [],
    });

    renderWithIntl(<FahrtenbuchAdmin />);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(
      screen.getByText('Sie haben keine Berechtigung für diese Seite.'),
    ).toBeInTheDocument();
  });
});
