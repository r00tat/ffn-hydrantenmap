// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../../common/fahrtenbuch';
import { renderWithIntl } from '../../../test-utils/intlRender';

const vehicle: FahrtenbuchVehicle = {
  id: 'v1',
  name: 'RLFA 2000',
  active: true,
  counters: VEHICLE_PRESETS.fahrzeug,
  fuelTypes: ['diesel'],
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

/**
 * Ein Zeitpunkt am Ersten des laufenden Monats. Die Seite startet mit dem
 * Zeitraum „dieses Jahr" (1. Januar bis heute); feste Datumsangaben im Test
 * fielen mit dem Jahreswechsel aus diesem Zeitraum heraus.
 */
function thisMonth(hour: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), 1, hour, 0, 0),
  ).toISOString();
}

function entry(partial: Partial<FahrtenbuchEntry>): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Muster',
    zweck: 'einsatz',
    ziel: 'Hauptstraße 1',
    abfahrt: thisMonth(8),
    ankunft: thisMonth(9),
    counters: { km: { start: 1000, end: 1030 } },
    group: 'ffnd',
    deleted: false,
    createdAt: '',
    createdBy: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    ...partial,
  };
}

const entries = [
  entry({ id: 'a', driverName: 'Max Muster' }),
  entry({
    id: 'b',
    driverName: 'Eva Beispiel',
    zweck: 'uebung',
    abfahrt: thisMonth(10),
    ankunft: thisMonth(12),
    counters: { km: { start: 1030, end: 1080 } },
  }),
];

vi.mock('../../../hooks/useFirebaseLogin', () => ({
  default: () => ({ isAuthorized: true, myGroups: [{ id: 'ffnd', name: 'FF' }] }),
}));
vi.mock('../../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useFahrtenbuchVehicles', () => ({
  default: () => ({
    vehicles: [vehicle],
    vehiclesById: new Map([['v1', vehicle]]),
    activeVehicles: [vehicle],
  }),
}));
vi.mock('../../../hooks/useFahrtenbuchEntries', () => ({
  default: () => entries,
}));

// Die Diagramme brauchen eine Zeichenfläche, die JSDOM nicht hat — dieselbe
// Behandlung wie in `Dosimetrie.test.tsx`. Geprüft wird hier der Zustand der
// Seite, nicht das Rendern von SVG.
vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: () => <div data-testid="barchart" />,
}));
vi.mock('@mui/x-charts/PieChart', () => ({
  PieChart: () => <div data-testid="piechart" />,
}));

import FahrtenbuchStatistikPage from './FahrtenbuchStatistikPage';

describe('FahrtenbuchStatistikPage', () => {
  it('zeigt die Kennzahlen des Zeitraums', () => {
    renderWithIntl(<FahrtenbuchStatistikPage />);

    // Zwei Fahrten, 30 + 50 km, dazu 1 h und 2 h unterwegs.
    expect(screen.getByText('80 km')).toBeInTheDocument();
    expect(screen.getByText('3 h 0 min')).toBeInTheDocument();
    expect(screen.getByText('40 km')).toBeInTheDocument();
  });

  it('listet beide Fahrer mit ihren Kilometern', () => {
    renderWithIntl(<FahrtenbuchStatistikPage />);

    expect(screen.getByText('Max Muster')).toBeInTheDocument();
    expect(screen.getByText('Eva Beispiel')).toBeInTheDocument();
  });

  it('filtert über einen Klick auf eine Fahrerzeile und zeigt den Filter als Chip', async () => {
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchStatistikPage />);

    expect(screen.getByText('2 Fahrten im Ausschnitt')).toBeInTheDocument();

    await user.click(screen.getByText('Eva Beispiel'));

    expect(screen.getByText('Fahrer: Eva Beispiel')).toBeInTheDocument();
    expect(screen.getByText('1 Fahrt im Ausschnitt')).toBeInTheDocument();
    // Nur noch die Kilometer dieser einen Fahrt — als Summe und als Mittel.
    expect(screen.getAllByText('50 km')).toHaveLength(2);
  });

  it('übernimmt ein Fahrzeug aus dem Link als Filter', () => {
    renderWithIntl(<FahrtenbuchStatistikPage initialVehicleId="v1" />);

    expect(screen.getByText('Fahrzeug: RLFA 2000')).toBeInTheDocument();
  });

  it('startet mit der Strecke als Kennzahl, weil die Gruppe Kilometer zählt', () => {
    renderWithIntl(<FahrtenbuchStatistikPage />);

    expect(
      screen.getByRole('combobox', { name: 'Kennzahl' }),
    ).toHaveTextContent('Strecke');
  });
});
