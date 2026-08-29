// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzFuellung } from '../../common/atemschutz';

// Die Seite hängt an einem Dutzend Firestore-Hooks. Gemockt wird alles, was
// eine Subscription aufmachen würde — geprüft wird hier nur die Filterlogik
// und dass sie in der URL landet.
const { replaceMock, sucheStub, fuellungenMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  sucheStub: { value: '' },
  fuellungenMock: vi.fn(),
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
  default: () => ({ email: 'a@b.c', displayName: 'Paul', uid: 'u1' }),
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
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('FuellprotokollPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    sucheStub.value = '';
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
    });
  });

  it('blendet mit ?verrechnen=1 die übrigen Zeilen aus', () => {
    sucheStub.value = 'verrechnen=1';
    renderWithIntl(<FuellprotokollPage />);

    expect(screen.getByText(/2\.16\.19/)).toBeInTheDocument();
    expect(screen.queryByText(/2\.16\.04/)).not.toBeInTheDocument();
  });
});
