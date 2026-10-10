// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleData } from './bekleidungFixtures';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  groupIds: [] as (string | undefined)[],
  setGroupId: vi.fn(),
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({ default: () => mocks.login() }));
vi.mock('../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [
      { id: 'ffnd', name: 'FF Neusiedl' },
      { id: 'other', name: 'FF Muster' },
    ],
    groupId: 'ffnd',
    setGroupId: mocks.setGroupId,
  }),
}));
vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: (groupId?: string) => {
    const persons = groupId ? sampleData().persons : [];
    return { persons, activePersons: persons.filter((p) => p.active !== false) };
  },
}));
vi.mock('../../hooks/useBekleidung', () => {
  const state = (key: 'artikel' | 'stuecke' | 'bestand' | 'ausgaben' | 'waeschen') =>
    (groupId?: string) => {
      mocks.groupIds.push(groupId);
      return { records: groupId ? sampleData()[key] : [], loading: false, fromCache: false };
    };
  return {
    useBekleidungArtikel: state('artikel'),
    useBekleidungStuecke: state('stuecke'),
    useBekleidungBestand: state('bestand'),
    useBekleidungAusgaben: state('ausgaben'),
    useBekleidungWaeschen: state('waeschen'),
  };
});
vi.mock('./bekleidungActions', () => ({}));
vi.mock('./BekleidungswartSettings', () => ({
  default: ({ groupId }: { groupId: string }) => <div>Einstellungen für {groupId}</div>,
}));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../hooks/useConnectivity', () => ({ default: () => ({ status: 'online' }) }));
vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: () => ({ videoRef: { current: null }, status: 'unsupported', frames: 0 }),
}));

import BekleidungPage from './BekleidungPage';

const member = {
  isAuthorized: true,
  isAdmin: false,
  groups: ['ffnd', 'other'],
  groupAdmin: [] as string[],
  bekleidungswart: [] as string[],
};

describe('BekleidungPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.groupIds.length = 0;
  });

  it('weist ein einfaches Mitglied ab und abonniert nichts', () => {
    mocks.login.mockReturnValue(member);
    renderWithIntl(<BekleidungPage />);
    expect(screen.getByText(/verwalten nur Bekleidungswarte/)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(mocks.groupIds.every((id) => id === undefined)).toBe(true);
  });

  it('zeigt dem Bekleidungswart die Reiter ohne Einstellungen', async () => {
    mocks.login.mockReturnValue({ ...member, bekleidungswart: ['ffnd'] });
    const user = userEvent.setup();
    renderWithIntl(<BekleidungPage />);
    expect(screen.getByRole('combobox', { name: 'Gruppe' })).toBeInTheDocument();
    for (const name of ['Stücke', 'Lagerstand', 'Personen', 'Wäsche', 'Artikel']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tab', { name: 'Einstellungen' })).not.toBeInTheDocument();
    expect(mocks.groupIds).toContain('ffnd');
    expect(screen.getByText('1001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wäsche erfassen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('zeigt dem Gruppen-Admin die Einstellungen', async () => {
    mocks.login.mockReturnValue({ ...member, groupAdmin: ['ffnd'] });
    const user = userEvent.setup();
    renderWithIntl(<BekleidungPage />);
    await user.click(screen.getByRole('tab', { name: 'Einstellungen' }));
    expect(screen.getByText('Einstellungen für ffnd')).toBeInTheDocument();
  });

  it('öffnet die Rücknahme vorbelegt aus dem Personen-Reiter', async () => {
    mocks.login.mockReturnValue({ ...member, bekleidungswart: ['ffnd'] });
    const user = userEvent.setup();
    renderWithIntl(<BekleidungPage />);
    await user.click(screen.getByRole('tab', { name: 'Personen' }));
    await user.click(screen.getByRole('combobox', { name: 'Person wählen' }));
    await user.click(screen.getByRole('option', { name: 'Max Mustermann' }));
    const buttons = screen.getAllByRole('button', { name: 'Zurücknehmen' });
    await user.click(buttons[buttons.length - 1]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Einsatzjacke · M · #1002');
  });
});
