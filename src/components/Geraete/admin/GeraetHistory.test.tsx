// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand, GeraetBuchung } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { getDocs, startAfter, where, limit } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  startAfter: vi.fn((doc: unknown) => ({ startAfter: doc })),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  limit: vi.fn((n: number) => ({ limit: n })),
}));

vi.mock('../../firebase/firebase', () => ({ default: {}, firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...path: unknown[]) => ({ path })),
  getDocs,
  limit,
  orderBy: vi.fn((...args: unknown[]) => ({ orderBy: args })),
  query: vi.fn((...args: unknown[]) => ({ query: args })),
  startAfter,
  where,
}));

const { default: GeraetHistory, HISTORY_PAGE_SIZE } = await import('./GeraetHistory');

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Ölbindemittel',
  einheit: 'Sack',
  verbrauchsmaterial: true,
  active: true,
  chargen: [{ id: 'c1', produktionsNummer: 'A-17', createdAt: '2026-01-01', createdBy: 'u1' }],
} as Geraet;

const bestaende: GeraetBestand[] = [
  {
    id: 'b1',
    geraetId: 'g1',
    lagerortKey: 'raum|Lager',
    lagerort: { art: 'raum', raum: 'Lager' },
    anzahl: 5,
  } as GeraetBestand,
  {
    id: 'b2',
    geraetId: 'g1',
    lagerortKey: 'raum|Keller',
    lagerort: { art: 'raum', raum: 'Keller' },
    anzahl: 2,
  } as GeraetBestand,
];

function buchung(id: string, data: Partial<GeraetBuchung>): GeraetBuchung {
  return {
    id,
    geraetId: 'g1',
    art: 'verbrauch',
    menge: 0,
    createdAt: '2026-10-01T08:30:00.000Z',
    createdBy: 'u1',
    ...data,
  };
}

function snapshot(entries: GeraetBuchung[]) {
  return {
    docs: entries.map((e) => {
      const { id, ...data } = e;
      return { id, data: () => data };
    }),
  };
}

async function expand() {
  await userEvent.click(screen.getByRole('button', { name: /Historie/ }));
}

describe('GeraetHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lädt nichts, solange der Bereich zugeklappt ist', () => {
    renderWithIntl(<GeraetHistory groupId="grp" geraet={geraet} bestaende={bestaende} />);
    expect(screen.getByText('Historie')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('zeigt die Einträge nach dem Aufklappen', async () => {
    getDocs.mockResolvedValueOnce(
      snapshot([
        buchung('v1', {
          art: 'verbrauch',
          menge: -3,
          bestandId: 'b1',
          chargeId: 'c1',
          firecallId: 'fc1',
          firecallName: 'Brandübung Halle',
          firecallArt: 'uebung',
          createdByName: 'Max Muster',
          bemerkung: 'Ölspur',
        }),
        buchung('s1', {
          art: 'stammdaten',
          aenderungen: [
            { feld: 'mindestbestand', vorher: '10', nachher: '20' },
            { feld: 'unbekanntesFeld', nachher: 'x' },
          ],
        }),
        buchung('u1', { art: 'umbuchung', menge: 2, bestandId: 'b1', zielBestandId: 'b2' }),
      ]),
    );
    renderWithIntl(<GeraetHistory groupId="grp" geraet={geraet} bestaende={bestaende} />);
    await expand();

    expect(await screen.findByText('Max Muster')).toBeInTheDocument();
    expect(where).toHaveBeenCalledWith('geraetId', '==', 'g1');
    expect(limit).toHaveBeenCalledWith(HISTORY_PAGE_SIZE);

    expect(screen.getByText('Verbrauch')).toBeInTheDocument();
    expect(screen.getByText('-3 Sack')).toBeInTheDocument();
    expect(screen.getByText('LOT A-17')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Brandübung Halle' });
    expect(link).toHaveAttribute('href', '/einsatz/fc1');
    expect(screen.getByText('Übung')).toBeInTheDocument();
    expect(screen.getByText('Ölspur')).toBeInTheDocument();

    expect(screen.getByText('Stammdaten')).toBeInTheDocument();
    expect(screen.getByText('Mindestbestand: 10 → 20')).toBeInTheDocument();
    expect(screen.getByText('unbekanntesFeld: — → x')).toBeInTheDocument();
    // Ohne Namen: Strich.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    expect(screen.getByText('Umbuchung')).toBeInTheDocument();
    expect(screen.getByText('+2 Sack')).toBeInTheDocument();
    expect(screen.getByText('Lager → Keller')).toBeInTheDocument();

    // Weniger als eine volle Seite: kein „Mehr laden".
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).not.toBeInTheDocument();
  });

  it('lädt mit „Mehr laden" die nächste Seite nach', async () => {
    const first = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) =>
      buchung(`a${i}`, { art: 'zugang', menge: 1, createdByName: `Person ${i}` }),
    );
    const firstSnap = snapshot(first);
    getDocs
      .mockResolvedValueOnce(firstSnap)
      .mockResolvedValueOnce(
        snapshot([buchung('z1', { art: 'inventur', menge: -1, createdByName: 'Letzte Person' })]),
      );
    renderWithIntl(<GeraetHistory groupId="grp" geraet={geraet} bestaende={bestaende} />);
    await expand();
    await screen.findByText('Person 0');

    await userEvent.click(screen.getByRole('button', { name: 'Mehr laden' }));

    expect(await screen.findByText('Letzte Person')).toBeInTheDocument();
    expect(startAfter).toHaveBeenCalledWith(firstSnap.docs[HISTORY_PAGE_SIZE - 1]);
    expect(screen.getByText('Person 0')).toBeInTheDocument();
    expect(getDocs).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mehr laden' })).not.toBeInTheDocument(),
    );
  });

  it('zeigt den leeren Zustand', async () => {
    getDocs.mockResolvedValueOnce(snapshot([]));
    renderWithIntl(<GeraetHistory groupId="grp" geraet={geraet} bestaende={bestaende} />);
    await expand();
    expect(await screen.findByText('Noch keine Einträge')).toBeInTheDocument();
  });

  it('zeigt einen Fehler beim Laden', async () => {
    getDocs.mockRejectedValueOnce(new Error('kaputt'));
    renderWithIntl(<GeraetHistory groupId="grp" geraet={geraet} bestaende={bestaende} />);
    await expand();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/kaputt/)).toBeInTheDocument();
  });
});
