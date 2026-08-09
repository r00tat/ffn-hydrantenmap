// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';

const vehicle: FahrtenbuchVehicle = {
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

// `fahrtenbuchActions` ist 'use server'/'server-only' und lässt sich im Test
// nicht laden — der Eintrags-Dialog zieht das Modul mit herein.
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
    vehicles: [vehicle],
    vehiclesById: new Map([['v1', vehicle]]),
    activeVehicles: [vehicle],
  }),
}));
vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: () => ({ persons: [], activePersons: [] }),
}));
vi.mock('../../hooks/useFahrtenbuchEntries', () => ({ default: () => [] }));
vi.mock('../../hooks/useFahrtenbuchMangel', () => ({
  default: () => ({
    mangel: [],
    openMangel: [],
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
});
