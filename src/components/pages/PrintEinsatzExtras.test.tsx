// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz } from '../../common/geraet';
import { renderWithIntl as render } from '../../test-utils/intlRender';

const state = vi.hoisted(() => ({
  groups: ['ffnd'] as string[],
  entries: [] as GeraetEinsatz[],
  geraeteGroupId: vi.fn(),
}));

vi.mock('../../hooks/useFirecall', () => ({
  default: () => ({ id: 'fc1', name: 'Ölspur', group: 'ffnd' }),
  FirecallContext: { Provider: () => null },
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ email: 'erika.musterfrau@example.com', groups: state.groups }),
}));
vi.mock('../../hooks/useFahrtenbuchEntries', () => ({ default: () => [] }));
vi.mock('../../app/blaulicht-sms/actions', () => ({ getBlaulichtSmsAlarmById: vi.fn() }));
vi.mock('../firebase/firebase', () => ({ default: {}, firestore: {}, auth: {} }));
vi.mock('../../hooks/useAtemschutzEinsatzdaten', () => ({ default: () => ({}) }));
vi.mock('../../hooks/useAtemschutzGeraete', () => ({ default: () => ({ geraete: [] }) }));

const vlies: Geraet = {
  id: 'vlies',
  bezeichnung: 'Bindevlies Economy',
  inventarNr: 'BV-1',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  bestandGesamt: 10,
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};
const srf: GeraetBestand = {
  id: 'srf',
  geraetId: 'vlies',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 3,
};
vi.mock('../../hooks/useGeraete', () => ({
  default: (groupId?: string) => {
    state.geraeteGroupId(groupId);
    return {
      geraete: groupId ? [vlies] : [],
      bestaende: [],
      bestaendeByGeraet: new Map(),
      bestandById: new Map(groupId ? [['srf', srf]] : []),
      loading: false,
      fromCache: false,
    };
  },
}));
vi.mock('../Geraete/einsatz/useGeraetEinsatz', () => ({
  default: () => ({ entries: state.entries, loading: false, fromCache: false }),
}));

import { PrintGeraete } from './PrintEinsatzExtras';

const verbrauch: GeraetEinsatz = {
  id: 'e1',
  groupId: 'ffnd',
  geraetId: 'vlies',
  geraetName: 'Bindevlies (Kopie)',
  art: 'verbraucht',
  bestandId: 'srf',
  menge: 2,
  zeitpunkt: '2026-10-04T10:00:00.000Z',
  createdAt: '2026-10-04T10:00:00.000Z',
  createdBy: 'erika.musterfrau@example.com',
};

describe('PrintGeraete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.groups = ['ffnd'];
    state.entries = [];
  });

  it('druckt Geräte und Verbrauchsmaterial des Einsatzes wie die Sybos-Seite', () => {
    state.entries = [verbrauch, { ...verbrauch, id: 'e2', menge: 1 }];
    render(<PrintGeraete />);
    expect(screen.getByRole('heading', { name: 'Geräte & Material' })).toBeInTheDocument();
    expect(screen.getByText('Bindevlies Economy')).toBeInTheDocument();
    expect(screen.getByText('BV-1')).toBeInTheDocument();
    expect(screen.getByText('3 Sack')).toBeInTheDocument();
    expect(screen.getByText('SRF · GR 2')).toBeInTheDocument();
  });

  it('passt auf die Seite: ohne Sybos-ID, Stunden in der Mengen-Spalte', () => {
    state.entries = [
      verbrauch,
      {
        ...verbrauch,
        id: 'e3',
        geraetId: 'aggregat',
        geraetName: 'Stromaggregat',
        art: 'zugeordnet',
        bestandId: undefined,
        menge: undefined,
        stunden: 1.5,
      },
    ];
    render(<PrintGeraete />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Bezeichnung', 'Inventar-Nr.', 'Art', 'Menge', 'Lagerort', 'Bemerkung']);
    expect(screen.getByText('1,5 h')).toBeInTheDocument();
    expect(screen.getByText('2 Sack')).toBeInTheDocument();
  });

  it('ohne Einträge kein Abschnitt', () => {
    const { container } = render(<PrintGeraete />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ein Einsatz-Gast liest keine Stammdaten und druckt den kopierten Namen', () => {
    state.groups = ['allUsers'];
    state.entries = [verbrauch];
    render(<PrintGeraete />);
    expect(state.geraeteGroupId).not.toHaveBeenCalledWith('ffnd');
    expect(screen.getByText('Bindevlies (Kopie)')).toBeInTheDocument();
  });
});
