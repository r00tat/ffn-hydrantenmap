// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { isOpenMangel, type Mangel } from '../../common/mangel';
import { renderWithIntl } from '../../test-utils/intlRender';

const baseVehicle: FahrtenbuchVehicle = {
  id: 'v1',
  name: 'RLFA 2000',
  kennzeichen: 'ND-12345',
  active: true,
  counters: VEHICLE_PRESETS.fahrzeug,
  fuelTypes: [],
  lastCounters: { km: 1042 },
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

// Die Hooks liefern, was der jeweilige Test hier hineinlegt — die Mocks lesen
// bei jedem Rendern neu.
const state = {
  vehicle: baseVehicle,
  entries: [] as FahrtenbuchEntry[],
  mangel: [] as Mangel[],
};

beforeEach(() => {
  state.vehicle = baseVehicle;
  state.entries = [];
  state.mangel = [];
});

// `fahrtenbuchActions` ist 'use server'/'server-only' und lässt sich im Test
// nicht laden — der Eintrags-Dialog zieht das Modul mit herein.
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => 'unknown',
}));
vi.mock('./fahrtenbuchActions', () => ({
  createFahrtenbuchEntry: vi.fn().mockResolvedValue({ success: true }),
  updateFahrtenbuchEntry: vi.fn().mockResolvedValue({ success: true }),
  deleteFahrtenbuchEntry: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ isAuthorized: true }),
}));
vi.mock('../../hooks/useFahrtenbuchVehicles', () => ({
  default: () => ({
    vehicles: [state.vehicle],
    vehiclesById: new Map([['v1', state.vehicle]]),
    activeVehicles: [state.vehicle],
  }),
}));
vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: () => ({ persons: [], activePersons: [] }),
}));
vi.mock('../../hooks/useFahrtenbuchEntries', () => ({
  default: () => state.entries,
}));
vi.mock('../../hooks/useFahrtenbuchMangel', () => ({
  default: () => ({
    mangel: state.mangel,
    openMangel: state.mangel.filter(isOpenMangel),
    openCountByVehicle: new Map(),
  }),
}));
vi.mock('../../hooks/useFahrtenbuchFirecalls', () => ({ default: () => [] }));
vi.mock('./useEntryDeletion', () => ({
  default: () => ({
    deleteError: undefined,
    clearDeleteError: vi.fn(),
    requestDelete: vi.fn(),
  }),
}));

import FahrtenbuchVehiclePage from './FahrtenbuchVehiclePage';

describe('FahrtenbuchVehiclePage', () => {
  it('führt über einen Zurück-Button auf die Fahrzeug-Übersicht', () => {
    // Die Fahrzeug-Ansicht ist ein teilbarer Link und wird auch direkt geöffnet
    // — ohne diesen Button gibt es von dort keinen Weg zur Übersicht.
    renderWithIntl(<FahrtenbuchVehiclePage groupId="ffnd" vehicleId="v1" />);

    expect(
      screen.getByRole('link', { name: 'Zurück zur Übersicht' }),
    ).toHaveAttribute('href', '/fahrtenbuch');
  });

  it('zeigt den Fahrzeugnamen als Titel', () => {
    renderWithIntl(<FahrtenbuchVehiclePage groupId="ffnd" vehicleId="v1" />);
    expect(
      screen.getByRole('heading', { name: 'RLFA 2000' }),
    ).toBeInTheDocument();
  });

  it('zeigt den Defekt-Hinweis für eine Fahrt ohne Mangeldatensatz', () => {
    state.vehicle = {
      ...baseVehicle,
      lastEntryHasDefect: true,
      openMangelCount: 0,
      lastEntryMangelId: null,
    };
    renderWithIntl(<FahrtenbuchVehiclePage groupId="ffnd" vehicleId="v1" />);
    expect(screen.getByText('Defekt gemeldet')).toBeInTheDocument();
  });

  it('schweigt, wenn der Mangel zur letzten Fahrt behoben ist', () => {
    // #706: Der behobene Mangel nahm den Zähler weg und legte damit den
    // Hinweis frei, den er bis dahin verdeckt hatte.
    state.vehicle = {
      ...baseVehicle,
      lastEntryHasDefect: true,
      openMangelCount: 0,
      lastEntryMangelId: 'm1',
    };
    renderWithIntl(<FahrtenbuchVehiclePage groupId="ffnd" vehicleId="v1" />);
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
  });

  it('fällt auf die geladenen Mängel zurück, solange der Cache das Feld nicht kennt', () => {
    state.vehicle = {
      ...baseVehicle,
      lastEntryHasDefect: true,
      openMangelCount: 0,
    };
    state.entries = [{ id: 'e1' } as FahrtenbuchEntry];
    state.mangel = [
      { id: 'm1', entryId: 'e1', status: 'resolved' } as Mangel,
    ];
    renderWithIntl(<FahrtenbuchVehiclePage groupId="ffnd" vehicleId="v1" />);
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
  });
});
