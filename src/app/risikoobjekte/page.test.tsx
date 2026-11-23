// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RisikoObjekt } from '../../common/gis-objects';
import type { GroupRoles } from '../../common/permissions';
import { renderWithIntl } from '../../test-utils/intlRender';

const objekte: RisikoObjekt[] = [
  {
    id: 'spar',
    name: 'Spar Wr. Strasse',
    ortschaft: 'ND',
    adresse: 'Wienerstrasse 65',
    einsatzplanummer: '64',
    erfassungsdatum: '',
    risikogruppe: 'Geschäftsbauten > 2000 m2',
    link: 'https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N',
    lat: 47.9,
    lng: 16.8,
    groups: ['ffa'],
  },
  {
    id: 'schule',
    name: 'Volksschule',
    ortschaft: 'Weiden',
    adresse: 'Schulgasse 1',
    einsatzplanummer: '12',
    erfassungsdatum: '',
    risikogruppe: 'Schulen u. Kinderbetreuung',
    lat: 47.9,
    lng: 16.9,
  },
];

const collectionMock = vi.fn();
vi.mock('../../hooks/useFirebaseCollection', () => ({
  useFirebaseCollectionState: (opts: { collectionName: string }) => collectionMock(opts),
}));
vi.mock('../../components/site/OfflineListHint', () => ({ default: () => null }));
vi.mock('../../components/Objektplan/ObjektplanDialog', () => ({
  default: (props: { open: boolean; objekt: RisikoObjekt }) =>
    props.open ? <div data-testid="plan-dialog">{props.objekt.id}</div> : null,
}));

vi.mock('../../components/Objektplan/RisikoObjektEditDialog', () => ({
  default: (props: { open: boolean; objekt?: RisikoObjekt }) =>
    props.open ? <div data-testid="edit-dialog">{props.objekt?.id ?? 'neu'}</div> : null,
}));

const login = vi.hoisted(() => ({
  isAuthorized: true,
  isAdmin: false,
  groupRoles: {} as GroupRoles,
  myGroups: [] as Array<{ id: string; name: string }>,
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({ default: () => login }));
vi.mock('../groups/GroupAction', () => ({
  getGroupsAction: async () => [
    { id: 'ffa', name: 'FF Alpha' },
    { id: 'ffb', name: 'FF Beta' },
  ],
}));
const shareMock = vi.hoisted(() => vi.fn());
vi.mock('../../components/Objektplan/risikoobjektActions', () => ({
  shareUnsharedRisikoObjekte: shareMock,
}));

import RisikoobjektePage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  collectionMock.mockReturnValue({ records: objekte, loading: false, fromCache: false });
  login.isAdmin = false;
  login.groupRoles = { ffa: [] };
  login.myGroups = [{ id: 'ffa', name: 'FF Alpha' }];
  shareMock.mockResolvedValue({ ok: true, count: 1 });
});

describe('Risikoobjekte', () => {
  it('liest die Risikoobjekte und listet sie mit Ort und Adresse', () => {
    renderWithIntl(<RisikoobjektePage />);
    expect(collectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ collectionName: 'risikoobjekt' }),
    );
    expect(screen.getByText('Spar Wr. Strasse')).toBeInTheDocument();
    expect(screen.getByText('Volksschule')).toBeInTheDocument();
    expect(screen.getByText(/Wienerstrasse 65/)).toBeInTheDocument();
  });

  it('filtert über die Suche', () => {
    renderWithIntl(<RisikoobjektePage />);
    fireEvent.change(screen.getByLabelText('Objekt suchen'), { target: { value: 'weiden' } });
    expect(screen.queryByText('Spar Wr. Strasse')).not.toBeInTheDocument();
    expect(screen.getByText('Volksschule')).toBeInTheDocument();
  });

  it('öffnet die Pläne des angetippten Objekts', () => {
    renderWithIntl(<RisikoobjektePage />);
    fireEvent.click(screen.getByText('Spar Wr. Strasse'));
    expect(screen.getByTestId('plan-dialog')).toHaveTextContent('spar');
  });

  it('zeigt die Freigabe als Gruppenname', async () => {
    renderWithIntl(<RisikoobjektePage />);
    expect(await screen.findByText('FF Alpha')).toBeInTheDocument();
    expect(screen.getByText('nicht freigegeben')).toBeInTheDocument();
  });

  it('bietet Mitgliedern ohne Recht weder Anlegen noch Bearbeiten', () => {
    renderWithIntl(<RisikoobjektePage />);
    expect(screen.queryByRole('button', { name: 'Neues Objekt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('lässt Gruppen-Admins anlegen und eigene Objekte bearbeiten', () => {
    login.groupRoles = { ffa: ['gruppenadmin'] };
    renderWithIntl(<RisikoobjektePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Neues Objekt' }));
    expect(screen.getByTestId('edit-dialog')).toHaveTextContent('neu');
    const edits = screen.getAllByRole('button', { name: 'Bearbeiten' });
    expect(edits).toHaveLength(1);
  });

  it('gibt als Admin alle Objekte ohne Freigabe auf einmal frei', async () => {
    login.isAdmin = true;
    renderWithIntl(<RisikoobjektePage />);
    expect(screen.getByText(/1 Objekt ist noch keiner Gruppe freigegeben/)).toBeInTheDocument();
    fireEvent.mouseDown(await screen.findByLabelText('Freigeben für'));
    fireEvent.click(await screen.findByRole('option', { name: 'FF Beta' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Alle freigeben' }));
    await waitFor(() => expect(shareMock).toHaveBeenCalledWith(['ffb']));
    expect(await screen.findByText('1 Objekt freigegeben.')).toBeInTheDocument();
  });
});
