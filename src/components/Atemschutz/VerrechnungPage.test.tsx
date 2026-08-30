// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzFuellung } from '../../common/atemschutz';
import type { AtemschutzRechnung } from '../../common/atemschutzRechnung';

// Wie in `FuellprotokollPage.test.tsx`: alles gemockt, was eine Firestore-
// Subscription aufmachen würde. Geprüft wird die Bündelung und die
// Zugangsprüfung, nicht das Laden.
const { fuellungenMock, rechnungenMock, loginMock, pushMock } = vi.hoisted(() => ({
  fuellungenMock: vi.fn(),
  rechnungenMock: vi.fn(),
  loginMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../../hooks/useAtemschutzFuellungen', () => ({
  default: fuellungenMock,
}));

vi.mock('../../hooks/useAtemschutzRechnungen', () => ({
  default: rechnungenMock,
}));

vi.mock('../../hooks/useAtemschutzEmpfaenger', () => ({
  default: () => [],
}));

// Der Hook zieht beim Import den Firebase-Client nach, den es im Test nicht
// gibt — und die Lücken-Anzeige hängt an seinem Ergebnis.
vi.mock('../../hooks/useGroupStammdaten', () => ({
  default: () => ({
    absenderName: 'FF Musterdorf',
    absenderAdresse: 'Hauptstraße 1',
    absenderKontakt: '',
    kontoinhaber: '',
    iban: 'AT40 3300 0000 0202 0402',
    bic: '',
  }),
}));

vi.mock('../../hooks/useAtemschutzRechnungConfig', () => ({
  default: () => ({
    ccEmail: '',
    subjectTemplate: 'Rechnung',
    bodyTemplate: 'Text',
    leistungstext: 'Für das Füllen von Pressluftflaschen',
    zahlungszielTage: 14,
    ustHinweis: '',
    vorgabeTarif: '5.01',
  }),
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

vi.mock('../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [{ id: 'ffnd', name: 'Neusiedl' }],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: loginMock,
}));

vi.mock('../../hooks/useGroupFeuerwehrName', () => ({
  default: () => 'Neusiedl am See',
}));

vi.mock('../../hooks/useKostenersatz', () => ({
  useKostenersatzRates: () => ({
    rates: [
      { id: '5.01', price: 4.3 },
      { id: '5.02', price: 6.4 },
    ],
  }),
}));

vi.mock('./rechnungActions', () => ({
  createFuellungRechnung: vi.fn(),
  saveAtemschutzEmpfaenger: vi.fn(),
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import VerrechnungPage from './VerrechnungPage';

function fuellung(over: Partial<AtemschutzFuellung> = {}): AtemschutzFuellung {
  return {
    id: 'x1',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Paul',
    zeitpunkt: '2026-08-29T10:00:00.000Z',
    firecallId: '',
    verrechnen: true,
    feuerwehr: 'Winden am See',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function rechnung(over: Partial<AtemschutzRechnung> = {}): AtemschutzRechnung {
  return {
    id: 'r1',
    nummer: 'ATS-2026-001',
    status: 'sent',
    empfaenger: {
      feuerwehr: 'Winden am See',
      name: 'FF Winden',
      adresse: 'A',
      email: 'kdo@ff-winden.at',
    },
    positionen: [],
    rateVersion: 'LGBl_77_2023',
    summe: 4.3,
    datum: '2026-08-30T00:00:00.000Z',
    zeitraumVon: '2026-08-29T10:00:00.000Z',
    zeitraumBis: '2026-08-29T10:00:00.000Z',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('VerrechnungPage', () => {
  beforeEach(() => {
    loginMock.mockReturnValue({
      isAuthorized: true,
      groups: ['ffnd', 'kostenersatz'],
    });
    fuellungenMock.mockReturnValue({
      fuellungen: [
        fuellung({ id: 'a' }),
        fuellung({ id: 'b' }),
        fuellung({ id: 'c', feuerwehr: 'Jois' }),
      ],
      flaschenGesamt: 3,
    });
    rechnungenMock.mockReturnValue([]);
    pushMock.mockReset();
  });

  it('weist einen Benutzer ohne Kostenersatz-Freigabe ab', () => {
    loginMock.mockReturnValue({ isAuthorized: true, groups: ['ffnd'] });

    renderWithIntl(<VerrechnungPage />);

    expect(screen.getByText(/setzt die Kostenersatz-Freischaltung voraus/)).toBeInTheDocument();
    expect(screen.queryByText('Offene Füllungen')).not.toBeInTheDocument();
  });

  it('bündelt die offenen Füllungen je Feuerwehr mit ihrer Summe', () => {
    renderWithIntl(<VerrechnungPage />);

    expect(screen.getByText('Winden am See')).toBeInTheDocument();
    expect(screen.getByText('Jois')).toBeInTheDocument();
    // Zwei Flaschen à 4,30 € — die Sammelerfassung zählt über `anzahl`.
    expect(screen.getByText(/8,60/)).toBeInTheDocument();
  });

  it('zeigt eine bereits abgerechnete Füllung nicht als offen', () => {
    fuellungenMock.mockReturnValue({
      fuellungen: [fuellung({ id: 'a', rechnungId: 'r1' })],
      flaschenGesamt: 1,
    });

    renderWithIntl(<VerrechnungPage />);

    expect(screen.getByText('Keine offenen Füllungen zu verrechnen.')).toBeInTheDocument();
  });

  it('zeigt den Status einer Rechnung als Chip', () => {
    rechnungenMock.mockReturnValue([rechnung()]);

    renderWithIntl(<VerrechnungPage />);

    expect(screen.getByText('ATS-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Verschickt')).toBeInTheDocument();
  });
});

describe('VerrechnungPage — Navigation', () => {
  beforeEach(() => {
    loginMock.mockReturnValue({
      isAuthorized: true,
      groups: ['ffnd', 'kostenersatz'],
    });
    fuellungenMock.mockReturnValue({ fuellungen: [], flaschenGesamt: 0 });
    rechnungenMock.mockReturnValue([rechnung()]);
    pushMock.mockReset();
  });

  it('führt vom Klick auf die Zeile zur Rechnung', () => {
    renderWithIntl(<VerrechnungPage />);

    // Die ganze Zeile ist das Ziel, nicht nur die Nummer — ein Link auf
    // einem vierstelligen Text war kaum zu treffen.
    fireEvent.click(screen.getByText('ATS-2026-001'));

    expect(pushMock).toHaveBeenCalledWith('/atemschutz/verrechnung/r1');
  });

  it('bietet den Weg zurück ins Füllprotokoll', () => {
    renderWithIntl(<VerrechnungPage />);

    expect(screen.getByRole('link', { name: /Füllprotokoll/ })).toHaveAttribute(
      'href',
      '/atemschutz/fuellprotokoll',
    );
  });
});
