// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { useFirebaseLogin, useFahrtenbuchGroup, useGeraete } = vi.hoisted(() => ({
  useFirebaseLogin: vi.fn(),
  useFahrtenbuchGroup: vi.fn(),
  useGeraete: vi.fn(),
}));

vi.mock('../../../hooks/useFirebaseLogin', () => ({ default: useFirebaseLogin }));
vi.mock('../../../hooks/useFahrtenbuchGroup', () => ({ default: useFahrtenbuchGroup }));
vi.mock('../../../hooks/useGeraete', () => ({ default: useGeraete }));
vi.mock('../../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../../hooks/useConnectivity', () => ({
  default: () => ({ status: 'online' }),
}));
vi.mock('../geraeteActions', () => ({
  saveGeraet: vi.fn(),
  deleteGeraet: vi.fn(),
  createGeraetBestand: vi.fn(),
  bookGeraetBestand: vi.fn(),
  previewGeraetImport: vi.fn(),
  importGeraete: vi.fn(),
}));

import GeraeteAdminPage from './GeraeteAdminPage';

function geraet(over: Partial<Geraet>): Geraet {
  return {
    id: 'g',
    bezeichnung: 'Artikel',
    verbrauchsmaterial: false,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

const vlies = geraet({
  id: 'vlies',
  bezeichnung: 'Bindevlies Economy',
  klasse1: 'Schadstoff',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  mindestbestand: 10,
  bestandGesamt: 4,
  nachbestellenSeit: '2026-10-01T10:00:00.000Z',
});
const schere = geraet({
  id: 'schere',
  bezeichnung: 'Rettungsschere',
  klasse1: 'Technik',
  bestandGesamt: 1,
});
const vliesSrf: GeraetBestand = {
  id: 'b1',
  geraetId: 'vlies',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 4,
};

function setup({ manager }: { manager: boolean }) {
  useFirebaseLogin.mockReturnValue({
    isAuthorized: true,
    isAdmin: false,
    groups: ['ffnd'],
    groupAdmin: [],
    fahrtenbuchGeraetemeister: manager ? ['ffnd'] : [],
  });
  useFahrtenbuchGroup.mockReturnValue({
    groups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  });
  useGeraete.mockReturnValue({
    geraete: [vlies, schere],
    bestaende: [vliesSrf],
    bestaendeByGeraet: new Map([['vlies', [vliesSrf]]]),
    loading: false,
    fromCache: false,
  });
}

describe('GeraeteAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listet die Artikel und filtert nach Suchtext', async () => {
    setup({ manager: false });
    const user = userEvent.setup();
    renderWithIntl(<GeraeteAdminPage />);
    expect(screen.getByText('Bindevlies Economy')).toBeInTheDocument();
    expect(screen.getByText('Rettungsschere')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Suche/), 'schere');
    expect(screen.queryByText('Bindevlies Economy')).not.toBeInTheDocument();
    expect(screen.getByText('Rettungsschere')).toBeInTheDocument();
  });

  it('filtert nach Verbrauchsmaterial', async () => {
    setup({ manager: false });
    const user = userEvent.setup();
    renderWithIntl(<GeraeteAdminPage />);
    await user.click(screen.getByRole('button', { name: 'Nur Verbrauchsmaterial' }));
    expect(screen.getByText('Bindevlies Economy')).toBeInTheDocument();
    expect(screen.queryByText('Rettungsschere')).not.toBeInTheDocument();
  });

  it('zeigt unter „Nachzubestellen" die Artikel unter dem Mindestbestand', async () => {
    setup({ manager: false });
    const user = userEvent.setup();
    renderWithIntl(<GeraeteAdminPage />);
    await user.click(screen.getByRole('tab', { name: 'Nachzubestellen (1)' }));
    expect(screen.getByText('Bindevlies Economy')).toBeInTheDocument();
    expect(screen.queryByText('Rettungsschere')).not.toBeInTheDocument();
    expect(screen.getByText(/Bestand 4 Sack · Mindestbestand 10/)).toBeInTheDocument();
  });

  it('bietet Mitgliedern keine Pflege an', async () => {
    setup({ manager: false });
    const user = userEvent.setup();
    renderWithIntl(<GeraeteAdminPage />);
    expect(screen.queryByRole('button', { name: 'Neuer Artikel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();

    await user.click(screen.getByText('Bindevlies Economy'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('SRF · GR 2')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Zugang' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('bietet dem Gerätemeister Pflege, Import und Buchungen an', async () => {
    setup({ manager: true });
    const user = userEvent.setup();
    renderWithIntl(<GeraeteAdminPage />);
    expect(screen.getByRole('button', { name: 'Neuer Artikel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();

    await user.click(screen.getByText('Bindevlies Economy'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Zugang' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Umbuchung' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Inventur' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
  });

  it('verlangt eine Anmeldung', () => {
    setup({ manager: false });
    useFirebaseLogin.mockReturnValue({ isAuthorized: false });
    renderWithIntl(<GeraeteAdminPage />);
    expect(
      screen.getByText('Bitte melde dich an, um Geräte & Material zu sehen.'),
    ).toBeInTheDocument();
  });
});
