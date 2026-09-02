// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzFuellung } from '../../common/atemschutz';

// Die Seite hängt an einem Dutzend Firestore-Hooks. Gemockt wird alles, was
// eine Subscription aufmachen würde — geprüft wird hier nur die Filterlogik
// und dass sie in der URL landet.
const {
  replaceMock,
  sucheStub,
  fuellungenMock,
  updateFremdeMock,
  deleteFremdeMock,
  loginStub,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  sucheStub: { value: '' },
  fuellungenMock: vi.fn(),
  updateFremdeMock: vi.fn(),
  deleteFremdeMock: vi.fn(),
  loginStub: {
    value: {
      email: 'a@b.c',
      displayName: 'Paul',
      uid: 'u1',
      isAdmin: false,
      groups: ['ffnd'],
      groupAdmin: [] as string[],
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(sucheStub.value),
}));

vi.mock('../../hooks/useAtemschutzFuellungen', () => ({
  default: fuellungenMock,
}));

vi.mock('../../hooks/useAtemschutzGeraete', () => ({
  default: () => ({
    geraete: [],
    activeGeraete: [],
    flaschen: [],
    fuellstationen: [],
    geraeteById: new Map(),
    feuerwehren: [],
  }),
}));

vi.mock('../../hooks/useFahrtenbuchFirecalls', () => ({
  default: () => [{ id: 'e1', name: 'Brand K1', date: '2026-08-29' }],
}));

vi.mock('../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [{ id: 'ffnd', name: 'Neusiedl' }],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: () => ({ persons: [], activePersons: [] }),
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => loginStub.value,
}));

vi.mock('../../hooks/useGroupFeuerwehrName', () => ({
  default: () => 'Neusiedl am See',
}));

vi.mock('./atemschutzStore', () => ({
  addFuellung: vi.fn(),
  updateFuellung: vi.fn(),
  deleteFuellung: vi.fn(),
}));

// Der Mangel-Zweig des FuellungDialog zieht die Server-Action und den
// Storage-Upload nach sich — beide sind im Test nicht ladbar. Dieselben
// Attrappen wie in `FuellungDialog.test.tsx`.
vi.mock('./atemschutzActions', () => ({
  createAtemschutzMangel: vi.fn(),
}));

// `fuellprotokollActions` ist eine `'use server'`-Datei mit `server-only`;
// importiert aus einer Client-Komponente wirft sie im Test beim Laden.
vi.mock('./fuellprotokollActions', () => ({
  exportFuellprotokollPdf: vi.fn(),
  updateFremdeFuellung: updateFremdeMock,
  deleteFremdeFuellung: deleteFremdeMock,
  previewFuellungImport: vi.fn(),
  importFuellungen: vi.fn(),
}));

vi.mock('../Fahrtenbuch/uploadMangelImage', () => ({
  uploadMangelImage: vi.fn(),
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import FuellprotokollPage from './FuellprotokollPage';

function fuellung(over: Partial<AtemschutzFuellung> = {}): AtemschutzFuellung {
  return {
    id: 'x1',
    flaschenNummer: '2.16.19',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Paul',
    zeitpunkt: '2026-08-29T10:00:00.000Z',
    firecallId: '',
    verrechnen: false,
    createdAt: '',
    createdBy: 'u1',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('FuellprotokollPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    updateFremdeMock.mockReset().mockResolvedValue({ success: true });
    deleteFremdeMock.mockReset().mockResolvedValue({ success: true });
    sucheStub.value = '';
    loginStub.value = {
      email: 'a@b.c',
      displayName: 'Paul',
      uid: 'u1',
      isAdmin: false,
      groups: ['ffnd'],
      groupAdmin: [],
    };
    fuellungenMock.mockReturnValue({
      fuellungen: [
        fuellung({ id: 'a', flaschenNummer: '2.16.19', verrechnen: true }),
        fuellung({ id: 'b', flaschenNummer: '2.16.04', verrechnen: false }),
      ],
      flaschenGesamt: 2,
    });
  });

  it('schreibt den gewählten Einsatz in die URL fort', () => {
    renderWithIntl(<FuellprotokollPage />);

    fireEvent.mouseDown(screen.getByLabelText('Einsatz'));
    fireEvent.click(screen.getByRole('option', { name: 'Ohne Einsatz' }));

    expect(replaceMock).toHaveBeenCalledWith('?einsatz=ohne', {
      scroll: false,
    });
  });

  it('fragt ohne Filter alle Füllungen der Gruppe ab', () => {
    renderWithIntl(<FuellprotokollPage />);

    // `undefined` heißt „kein Einsatzfilter"; der leere String wäre der Filter
    // auf Stationsfüllungen und damit etwas anderes.
    expect(fuellungenMock).toHaveBeenCalledWith('ffnd', {
      firecallId: undefined,
      von: undefined,
      bis: undefined,
    });
  });

  it('blendet mit ?verrechnen=1 die übrigen Zeilen aus', () => {
    sucheStub.value = 'verrechnen=1';
    renderWithIntl(<FuellprotokollPage />);

    expect(screen.getByText(/2\.16\.19/)).toBeInTheDocument();
    expect(screen.queryByText(/2\.16\.04/)).not.toBeInTheDocument();
  });

  it('grenzt den Zeitraum serverseitig ein', () => {
    sucheStub.value = 'von=2026-08-01&bis=2026-08-31';
    renderWithIntl(<FuellprotokollPage />);

    // Tagesgrenzen in der Zone des Browsers — dieselbe, in der die Liste die
    // Uhrzeiten zeigt.
    expect(fuellungenMock).toHaveBeenCalledWith('ffnd', {
      firecallId: undefined,
      von: new Date('2026-08-01T00:00:00.000').toISOString(),
      bis: new Date('2026-08-31T23:59:59.999').toISOString(),
    });
  });

  it('filtert den Zweck clientseitig und zählt Altzeilen mit', () => {
    fuellungenMock.mockReturnValue({
      fuellungen: [
        fuellung({ id: 'a', flaschenNummer: '2.16.19', zweck: 'uebung' }),
        // Ohne Feld und ohne Einsatz: gilt als „Sonstiges".
        fuellung({ id: 'b', flaschenNummer: '2.16.04' }),
      ],
      flaschenGesamt: 2,
    });
    sucheStub.value = 'zweck=uebung';
    renderWithIntl(<FuellprotokollPage />);

    expect(screen.getByText(/2\.16\.19/)).toBeInTheDocument();
    expect(screen.queryByText(/2\.16\.04/)).not.toBeInTheDocument();
  });

  it('zeigt das Datum, sobald eine Zeile nicht von heute ist', () => {
    fuellungenMock.mockReturnValue({
      fuellungen: [fuellung({ id: 'a', zeitpunkt: '2026-08-29T10:00:00.000Z' })],
      flaschenGesamt: 1,
    });
    renderWithIntl(<FuellprotokollPage />);

    expect(screen.getByText(/29\.08\.2026/)).toBeInTheDocument();
  });

  it('lässt eine fremde Zeile weder bearbeiten noch löschen', () => {
    fuellungenMock.mockReturnValue({
      fuellungen: [fuellung({ id: 'a', createdBy: 'jemand-anderes' })],
      flaschenGesamt: 1,
    });
    renderWithIntl(<FuellprotokollPage />);

    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Füllung löschen' }),
    ).toBeDisabled();
  });

  it('sperrt eine bereits verrechnete Zeile auch für den Erfasser', () => {
    fuellungenMock.mockReturnValue({
      fuellungen: [fuellung({ id: 'a', createdBy: 'u1', rechnungId: 'r1' })],
      flaschenGesamt: 1,
    });
    renderWithIntl(<FuellprotokollPage />);

    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
  });

  it('gibt dem Gruppen-Admin die fremde Zeile frei und löscht über die Action', async () => {
    loginStub.value = { ...loginStub.value, groupAdmin: ['ffnd'] };
    fuellungenMock.mockReturnValue({
      fuellungen: [fuellung({ id: 'a', createdBy: 'jemand-anderes' })],
      flaschenGesamt: 1,
    });
    renderWithIntl(<FuellprotokollPage />);

    const loeschen = screen.getByRole('button', { name: 'Füllung löschen' });
    expect(loeschen).not.toBeDisabled();
    fireEvent.click(loeschen);
    fireEvent.click(screen.getByRole('button', { name: 'Ja' }));

    // Nicht der Client-Schreibweg: Die Firestore-Regel sieht die
    // Gruppen-Admin-Rolle nicht und lehnte den Zugriff ab.
    await waitFor(() =>
      expect(deleteFremdeMock).toHaveBeenCalledWith('ffnd', 'a'),
    );
  });

  it('blendet den Import für ein einfaches Gruppenmitglied aus', () => {
    renderWithIntl(<FuellprotokollPage />);
    expect(
      screen.queryByRole('button', { name: 'Importieren' }),
    ).not.toBeInTheDocument();

    cleanup();
    loginStub.value = { ...loginStub.value, groupAdmin: ['ffnd'] };
    renderWithIntl(<FuellprotokollPage />);
    expect(
      screen.getByRole('button', { name: 'Importieren' }),
    ).toBeInTheDocument();
  });
});
