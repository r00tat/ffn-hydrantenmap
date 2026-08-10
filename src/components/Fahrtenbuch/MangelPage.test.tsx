// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchParamsMock, isAdminMock } = vi.hoisted(() => ({
  searchParamsMock: { value: new URLSearchParams() },
  isAdminMock: { value: false },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.value,
}));

// `mangelActions` ist 'use server'/'server-only' und lässt sich im Test nicht
// laden — Seite und Dialog ziehen das Modul mit herein.
vi.mock('./mangelActions', () => ({
  createMangel: vi.fn().mockResolvedValue({ success: true }),
  updateMangel: vi.fn().mockResolvedValue({ success: true }),
  changeMangelStatus: vi.fn().mockResolvedValue({ success: true }),
  deleteMangel: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ isAuthorized: true, isAdmin: isAdminMock.value }),
}));
vi.mock('../../hooks/useFahrtenbuchGroup', () => ({
  default: () => ({
    groups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
    groupId: 'ffnd',
    setGroupId: vi.fn(),
  }),
}));

import {
  VEHICLE_PRESETS,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import type { Mangel } from '../../common/mangel';

const vehicles: FahrtenbuchVehicle[] = [
  {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: [],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  },
  {
    id: 'v2',
    name: 'MZB',
    active: true,
    counters: VEHICLE_PRESETS.boot,
    fuelTypes: [],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  },
];

vi.mock('../../hooks/useFahrtenbuchVehicles', () => ({
  default: () => ({
    vehicles,
    vehiclesById: new Map(vehicles.map((v) => [v.id as string, v])),
    activeVehicles: vehicles,
  }),
}));

function mangel(overrides: Partial<Mangel> = {}): Mangel {
  return {
    id: 'm1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    description: 'Blinker hinten links defekt',
    status: 'open',
    notes: [],
    reportedAt: '2026-08-01T08:00:00.000Z',
    reportedBy: 'u9',
    reportedByName: 'Bernd Beispiel',
    group: 'ffnd',
    createdAt: '2026-08-01T08:00:00.000Z',
    createdBy: 'u9',
    updatedAt: '2026-08-01T08:00:00.000Z',
    updatedBy: 'u9',
    ...overrides,
  };
}

const MANGEL: Mangel[] = [
  mangel(),
  mangel({
    id: 'm2',
    vehicleId: 'v2',
    vehicleName: 'MZB',
    description: 'Lenzpumpe zieht nicht',
    status: 'inProgress',
  }),
  mangel({
    id: 'm3',
    vehicleId: 'v1',
    description: 'Scheibenwischer erneuert',
    status: 'resolved',
    resolvedAt: '2026-08-05T09:00:00.000Z',
  }),
];

vi.mock('../../hooks/useFahrtenbuchMangel', () => ({
  default: () => ({
    mangel: MANGEL,
    openMangel: MANGEL.filter((m) => m.status !== 'resolved'),
    openCountByVehicle: new Map([
      ['v1', 1],
      ['v2', 1],
    ]),
  }),
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import MangelPage from './MangelPage';

beforeEach(() => {
  searchParamsMock.value = new URLSearchParams();
  isAdminMock.value = false;
});

const renderWithIntlPage = () => renderWithIntl(<MangelPage />);

describe('MangelPage', () => {
  it('zeigt standardmäßig die offenen Mängel aller Fahrzeuge', () => {
    // Die Seite ist fahrzeugübergreifend — das ist der Regelfall, nicht die
    // auf ein Fahrzeug gefilterte Sicht.
    renderWithIntlPage();
    expect(screen.getByText('Blinker hinten links defekt')).toBeInTheDocument();
    expect(screen.getByText('Lenzpumpe zieht nicht')).toBeInTheDocument();
    // Behobene Mängel gehören nicht in die Arbeitsliste.
    expect(screen.queryByText('Scheibenwischer erneuert')).toBeNull();
  });

  it('zeigt mit dem Filter „Alle" auch behobene Mängel', async () => {
    renderWithIntlPage();
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Alle' }));
    expect(screen.getByText('Scheibenwischer erneuert')).toBeInTheDocument();
  });

  it('filtert auf einen einzelnen Status', async () => {
    renderWithIntlPage();
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'In Arbeit' }));
    expect(screen.getByText('Lenzpumpe zieht nicht')).toBeInTheDocument();
    expect(screen.queryByText('Blinker hinten links defekt')).toBeNull();
  });

  it('belegt den Fahrzeugfilter aus dem Query-Parameter vor', () => {
    // Der Weg vom Chip auf der Fahrzeugkarte. Die Seite bleibt trotzdem
    // fahrzeugübergreifend — der Filter ist umstellbar.
    searchParamsMock.value = new URLSearchParams('vehicle=v2');
    renderWithIntlPage();
    expect(screen.getByText('Lenzpumpe zieht nicht')).toBeInTheDocument();
    expect(screen.queryByText('Blinker hinten links defekt')).toBeNull();
  });

  it('zeigt den Löschbutton nur für Admins', () => {
    const { unmount } = renderWithIntlPage();
    expect(
      screen.queryByRole('button', { name: 'Mangel löschen' }),
    ).not.toBeInTheDocument();
    unmount();

    isAdminMock.value = true;
    renderWithIntlPage();
    expect(
      screen.getAllByRole('button', { name: 'Mangel löschen' }).length,
    ).toBeGreaterThan(0);
  });

  it('führt über einen Zurück-Button ins Fahrtenbuch', () => {
    renderWithIntlPage();
    expect(
      screen.getByRole('link', { name: 'Zurück zur Übersicht' }),
    ).toHaveAttribute('href', '/fahrtenbuch');
  });

  it('öffnet den Dialog zum Melden eines Mangels', async () => {
    renderWithIntlPage();
    await userEvent.click(screen.getByRole('button', { name: 'Mangel melden' }));
    expect(
      screen.getByRole('dialog', { name: 'Mangel melden' }),
    ).toBeInTheDocument();
  });
});

