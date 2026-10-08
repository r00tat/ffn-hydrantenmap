// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz, GeraetSet } from '../../../common/geraet';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

const state = vi.hoisted(() => ({
  firecall: { id: 'fc1', name: 'Ölspur', group: 'ffnd' } as Record<string, unknown>,
  canWrite: true,
  entries: [] as GeraetEinsatz[],
  fromCache: false,
  pending: new Set<string>(),
  deleteEntry: vi.fn(),
  resync: vi.fn((..._args: unknown[]) => true),
  dialogProps: vi.fn(),
  groups: ['ffnd'] as string[],
  reconnect: undefined as undefined | (() => void),
  setsGroupId: vi.fn(),
}));

vi.mock('../../../hooks/useFirecall', () => ({ default: () => state.firecall }));
vi.mock('../../../hooks/useFirebaseLogin', () => ({
  default: () => ({ email: 'erika.musterfrau@example.com', uid: 'u1', groups: state.groups }),
}));
vi.mock('../../../lib/connectivity', () => ({
  isOffline: () => false,
  onReconnect: (callback: () => void) => {
    state.reconnect = callback;
    return () => {
      state.reconnect = undefined;
    };
  },
}));
vi.mock('../../../hooks/useFirecallWriteAccess', () => ({ default: () => state.canWrite }));
vi.mock('../../../hooks/useVehicles', () => ({
  default: () => ({ vehicles: [{ id: 'v1', name: 'SRF Neusiedl', type: 'vehicle' }] }),
}));
vi.mock('../../../hooks/usePendingDocIds', () => ({ default: () => state.pending }));
vi.mock('../../../hooks/useConnectivity', () => ({ default: () => ({ status: 'online' }) }));

const vlies: Geraet = {
  id: 'vlies',
  bezeichnung: 'Bindevlies Economy',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  bestandGesamt: 10,
  chargen: [
    { id: 'c1', losNummer: '4711', createdAt: '', createdBy: '' },
    { id: 'c0', losNummer: '0815', archiviert: true, createdAt: '', createdBy: '' },
  ],
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};
const srfBestand: GeraetBestand = {
  id: 'srf',
  geraetId: 'vlies',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 3,
};
vi.mock('../../../hooks/useGeraete', () => ({
  default: (groupId?: string) => ({
    geraete: groupId ? [vlies] : [],
    bestaende: groupId ? [srfBestand] : [],
    bestaendeByGeraet: new Map(groupId ? [['vlies', [srfBestand]]] : []),
    bestandById: new Map(groupId ? [['srf', srfBestand]] : []),
    loading: false,
    fromCache: false,
  }),
}));
const oelspurSet: GeraetSet = {
  id: 'oelspur',
  name: 'Ölspur',
  codes: [],
  inhalt: [{ geraetId: 'vlies' }],
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};
vi.mock('../../../hooks/useGeraetSets', () => ({
  default: (groupId?: string) => {
    state.setsGroupId(groupId);
    return { sets: groupId ? [oelspurSet] : [], loading: false, fromCache: false };
  },
}));
vi.mock('./useGeraetEinsatz', () => ({
  default: () => ({ entries: state.entries, loading: false, fromCache: state.fromCache }),
}));
vi.mock('./geraetEinsatzWrites', () => ({
  deleteGeraetEinsatz: state.deleteEntry,
  resyncPendingBooking: state.resync,
}));
vi.mock('./GeraetEinsatzDialog', () => ({
  default: (props: {
    entry?: GeraetEinsatz;
    groupId: string;
    vehicleNames: string[];
    sets?: GeraetSet[];
  }) => {
    state.dialogProps(props);
    return <div>Dialog {props.entry ? `bearbeiten ${props.entry.id}` : 'neu'}</div>;
  },
}));

import GeraeteEinsatzSection from './GeraeteEinsatzSection';

const verbrauch: GeraetEinsatz = {
  id: 'e1',
  groupId: 'ffnd',
  geraetId: 'vlies',
  geraetName: 'Bindevlies Economy',
  art: 'verbraucht',
  bestandId: 'srf',
  menge: 2,
  zeitpunkt: '2026-10-04T10:00:00.000Z',
  createdAt: '2026-10-04T10:00:00.000Z',
  createdBy: 'erika.musterfrau@example.com',
};
const zuordnung: GeraetEinsatz = {
  id: 'e2',
  groupId: 'ffnd',
  geraetId: 'aggregat',
  geraetName: 'Stromaggregat',
  art: 'zugeordnet',
  stunden: 1.5,
  zeitpunkt: '2026-10-04T09:00:00.000Z',
  createdAt: '2026-10-04T09:00:00.000Z',
  createdBy: 'erika.musterfrau@example.com',
};

describe('GeraeteEinsatzSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.firecall = { id: 'fc1', name: 'Ölspur', group: 'ffnd' };
    state.canWrite = true;
    state.entries = [];
    state.pending = new Set();
    state.groups = ['ffnd'];
  });

  it('zeigt ohne Einträge einen Hinweis', () => {
    render(<GeraeteEinsatzSection />);
    expect(screen.getByText('Noch keine Geräte oder Materialien erfasst.')).toBeInTheDocument();
  });

  it('listet Verbrauch und Zuordnung mit Menge, Lagerort und Buchungsstand', () => {
    state.entries = [verbrauch, zuordnung];
    render(<GeraeteEinsatzSection />);

    expect(screen.getByText('Bindevlies Economy')).toBeInTheDocument();
    expect(screen.getByText('Verbraucht')).toBeInTheDocument();
    expect(screen.getByText(/2 Sack · SRF · GR 2/)).toBeInTheDocument();
    expect(screen.getByText('noch nicht gebucht')).toBeInTheDocument();

    expect(screen.getByText('Stromaggregat')).toBeInTheDocument();
    expect(screen.getByText('Zugeordnet')).toBeInTheDocument();
    expect(screen.getByText(/1,5 h/)).toBeInTheDocument();
  });

  it('ein gebuchter Verbrauch zeigt keinen Hinweis', () => {
    state.entries = [{ ...verbrauch, gebucht: true }];
    render(<GeraeteEinsatzSection />);
    expect(screen.queryByText('noch nicht gebucht')).toBeNull();
  });

  it('öffnet den Dialog mit Gruppe und Fahrzeugen des Einsatzes', async () => {
    const user = userEvent.setup();
    render(<GeraeteEinsatzSection />);
    await user.click(screen.getByRole('button', { name: 'Erfassen' }));
    expect(screen.getByText('Dialog neu')).toBeInTheDocument();
    expect(state.dialogProps).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'ffnd', vehicleNames: ['SRF Neusiedl'] }),
    );
  });

  it('gibt dem Dialog die zugeordneten Artikel mit — Container darunter zählen als im Einsatz', async () => {
    state.entries = [verbrauch, zuordnung];
    const user = userEvent.setup();
    render(<GeraeteEinsatzSection />);
    await user.click(screen.getByRole('button', { name: 'Erfassen' }));
    expect(state.dialogProps).toHaveBeenCalledWith(
      expect.objectContaining({ assignedIds: ['vlies', 'aggregat'] }),
    );
  });

  it('eingebettet ohne Überschrift und Einleitung, aber mit Liste und Erfassen', () => {
    state.entries = [zuordnung];
    render(<GeraeteEinsatzSection embedded />);
    expect(screen.queryByRole('heading', { name: 'Geräte & Material' })).toBeNull();
    expect(screen.getByText('Stromaggregat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erfassen' })).toBeInTheDocument();
  });

  it('bearbeitet einen Eintrag', async () => {
    const user = userEvent.setup();
    state.entries = [verbrauch];
    render(<GeraeteEinsatzSection />);
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByText('Dialog bearbeiten e1')).toBeInTheDocument();
  });

  it('löscht nach Rückfrage', async () => {
    const user = userEvent.setup();
    state.entries = [verbrauch];
    render(<GeraeteEinsatzSection />);
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(screen.getByText(/wird auf den Lagerort zurückgebucht/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(state.deleteEntry).toHaveBeenCalledWith('fc1', verbrauch);
  });

  it('ohne Schreibrecht weder Erfassen noch Bearbeiten', () => {
    state.canWrite = false;
    state.entries = [verbrauch];
    render(<GeraeteEinsatzSection />);
    expect(screen.queryByRole('button', { name: 'Erfassen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.getByText('Nur Lesezugriff auf diesen Einsatz.')).toBeInTheDocument();
  });

  it('ohne Gruppe am Einsatz kein Erfassen', () => {
    state.firecall = { id: 'fc1', name: 'Ölspur' };
    render(<GeraeteEinsatzSection />);
    expect(screen.queryByRole('button', { name: 'Erfassen' })).toBeNull();
    expect(screen.getByText(/keiner Gruppe zugeordnet/)).toBeInTheDocument();
  });

  describe('erneuter Abgleich ungebuchter Verbräuche', () => {
    it('stößt einmal je Aufruf an, nicht für gebuchte, offene oder zugeordnete Einträge', () => {
      state.entries = [
        verbrauch,
        { ...verbrauch, id: 'e3', gebucht: true },
        { ...verbrauch, id: 'e4' },
        zuordnung,
      ];
      state.pending = new Set(['e4']);
      const { rerender } = render(<GeraeteEinsatzSection />);
      expect(state.resync).toHaveBeenCalledTimes(1);
      expect(state.resync).toHaveBeenCalledWith('fc1', verbrauch);

      state.entries = [...state.entries];
      rerender(<GeraeteEinsatzSection />);
      expect(state.resync).toHaveBeenCalledTimes(1);
    });

    it('stößt nach einem Reconnect erneut an', () => {
      state.entries = [verbrauch];
      render(<GeraeteEinsatzSection />);
      expect(state.resync).toHaveBeenCalledTimes(1);
      act(() => state.reconnect?.());
      expect(state.resync).toHaveBeenCalledTimes(2);
    });

    it('nicht für Einsatz-Gäste und ohne Schreibrecht', () => {
      state.entries = [verbrauch];
      state.groups = ['allUsers'];
      const { unmount } = render(<GeraeteEinsatzSection />);
      unmount();
      state.groups = ['ffnd'];
      state.canWrite = false;
      render(<GeraeteEinsatzSection />);
      expect(state.resync).not.toHaveBeenCalled();
    });
  });

  describe('Chargen', () => {
    it('zeigt die gebuchten Chargen in der Zeile, auch archivierte und unbekannte', () => {
      state.entries = [
        {
          ...verbrauch,
          menge: 6,
          chargen: [
            { chargeId: 'c1', menge: 2 },
            { chargeId: 'c0', menge: 1 },
            { chargeId: 'weg', menge: 1 },
            { chargeId: null, menge: 2 },
          ],
          chargenGeprueft: true,
        },
      ];
      render(<GeraeteEinsatzSection />);
      expect(
        screen.getByText(/Los 4711: 2, Los 0815: 1, weg: 1, ohne Charge: 2/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Charge prüfen')).toBeNull();
    });

    it('„Charge prüfen" öffnet den Eintrag zum Bearbeiten', async () => {
      const user = userEvent.setup();
      state.entries = [
        { ...verbrauch, chargen: [{ chargeId: 'c1', menge: 2 }], chargenGeprueft: false },
      ];
      render(<GeraeteEinsatzSection />);
      await user.click(screen.getByRole('button', { name: 'Charge prüfen' }));
      expect(screen.getByText('Dialog bearbeiten e1')).toBeInTheDocument();
    });

    it('ohne Schreibrecht ist „Charge prüfen" nur ein Hinweis', () => {
      state.canWrite = false;
      state.entries = [
        { ...verbrauch, chargen: [{ chargeId: 'c1', menge: 2 }], chargenGeprueft: false },
      ];
      render(<GeraeteEinsatzSection />);
      expect(screen.getByText('Charge prüfen')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Charge prüfen' })).toBeNull();
    });
  });

  it('ohne Einsatz ein Hinweis', () => {
    state.firecall = { id: 'unknown', name: '' };
    render(<GeraeteEinsatzSection />);
    expect(screen.getByText('Kein Einsatz gewählt.')).toBeInTheDocument();
  });

  describe('Sets', () => {
    const inSet = (entry: GeraetEinsatz, id: string): GeraetEinsatz => ({
      ...entry,
      id,
      setId: 'oelspur',
      setName: 'Ölspur',
      setZuordnungId: 'z1',
    });
    const setEntries = [inSet(verbrauch, 's1'), inSet(zuordnung, 's2')];

    it('gibt Gruppenmitgliedern die Sets an den Dialog', async () => {
      const user = userEvent.setup();
      render(<GeraeteEinsatzSection />);
      await user.click(screen.getByRole('button', { name: 'Erfassen' }));
      expect(state.dialogProps).toHaveBeenCalledWith(
        expect.objectContaining({ sets: [oelspurSet] }),
      );
    });

    it('liest für Einsatz-Gäste keine Sets', async () => {
      state.groups = ['allUsers'];
      const user = userEvent.setup();
      render(<GeraeteEinsatzSection />);
      expect(state.setsGroupId).toHaveBeenCalledWith(undefined);
      expect(state.setsGroupId).not.toHaveBeenCalledWith('ffnd');
      await user.click(screen.getByRole('button', { name: 'Erfassen' }));
      expect(state.dialogProps).toHaveBeenCalledWith(expect.objectContaining({ sets: [] }));
    });

    it('fasst die Einträge einer Set-Zuordnung unter einer Überschrift zusammen', () => {
      state.entries = [...setEntries, { ...verbrauch, id: 'e9', geraetName: 'Besen' }];
      render(<GeraeteEinsatzSection />);
      const header = screen.getByRole('listitem', { name: 'Set Ölspur' });
      expect(within(header).getByText('2 Einträge')).toBeInTheDocument();
      expect(screen.getByText('Stromaggregat')).toBeInTheDocument();
      expect(screen.getByText('Besen')).toBeInTheDocument();
    });

    it('klappt ein Set zu und wieder auf', async () => {
      const user = userEvent.setup();
      state.entries = setEntries;
      render(<GeraeteEinsatzSection />);
      await user.click(screen.getByRole('button', { name: 'Zuklappen' }));
      expect(screen.queryByText('Stromaggregat')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Aufklappen' }));
      expect(screen.getByText('Stromaggregat')).toBeInTheDocument();
    });

    it('entfernt das ganze Set nach Rückfrage', async () => {
      const user = userEvent.setup();
      state.entries = setEntries;
      render(<GeraeteEinsatzSection />);
      await user.click(screen.getByRole('button', { name: 'Aktionen für das Set' }));
      await user.click(screen.getByRole('menuitem', { name: 'Ganzes Set entfernen' }));
      expect(
        screen.getByText(/Alle 2 Einträge des Sets „Ölspur“ werden entfernt/),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Löschen' }));
      expect(state.deleteEntry).toHaveBeenCalledTimes(2);
      expect(state.deleteEntry).toHaveBeenCalledWith('fc1', setEntries[0]);
      expect(state.deleteEntry).toHaveBeenCalledWith('fc1', setEntries[1]);
    });

    it('ohne Schreibrecht kein Menü am Set', () => {
      state.canWrite = false;
      state.entries = setEntries;
      render(<GeraeteEinsatzSection />);
      expect(screen.queryByRole('button', { name: 'Aktionen für das Set' })).toBeNull();
    });
  });
});
