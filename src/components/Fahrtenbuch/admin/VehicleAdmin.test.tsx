// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type CounterDefinition,
  type FahrtenbuchVehicle,
} from '../../../common/fahrtenbuch';
import { renderWithIntl } from '../../../test-utils/intlRender';

// `stammdatenActions` ist eine 'use server'/'server-only'-Datei und lässt sich
// im Test nicht laden.
const { saveFahrtenbuchVehicle, deleteFahrtenbuchVehicle } = vi.hoisted(() => ({
  saveFahrtenbuchVehicle: vi.fn(),
  deleteFahrtenbuchVehicle: vi.fn(),
}));

vi.mock('../stammdatenActions', () => ({
  saveFahrtenbuchVehicle,
  deleteFahrtenbuchVehicle,
  // Vom Import-Dialog importiert, der beim Öffnen der Seite nicht rendert.
  previewVehicleImport: vi.fn(),
  importVehiclesFromKostenersatz: vi.fn(),
}));

const { useFahrtenbuchVehicles } = vi.hoisted(() => ({
  useFahrtenbuchVehicles: vi.fn(),
}));

vi.mock('../../../hooks/useFahrtenbuchVehicles', () => ({
  default: useFahrtenbuchVehicles,
}));

import VehicleAdmin from './VehicleAdmin';

/**
 * Zähler wie aus Firestore: dieselben Werte, aber eine andere Feldreihenfolge
 * als im Preset-Literal. Ein Vergleich über `JSON.stringify` würde hier
 * scheitern und das Boot als Straßenfahrzeug erkennen.
 */
function reordered(counters: CounterDefinition[]): CounterDefinition[] {
  return counters.map((counter) => ({
    id: counter.id,
    label: counter.label,
    unit: counter.unit,
    mode: counter.mode,
    changeWarning: counter.changeWarning,
    required: counter.required,
    ...(counter.labelKey ? { labelKey: counter.labelKey } : {}),
  }));
}

function vehicle(
  overrides: Partial<FahrtenbuchVehicle> & { id: string; name: string },
): FahrtenbuchVehicle {
  return {
    active: true,
    counters: [],
    fuelTypes: [],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

function setVehicles(vehicles: FahrtenbuchVehicle[]) {
  useFahrtenbuchVehicles.mockReturnValue({
    vehicles,
    activeVehicles: vehicles,
    vehiclesById: new Map(vehicles.map((v) => [v.id as string, v])),
  });
}

describe('VehicleAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveFahrtenbuchVehicle.mockResolvedValue({ success: true, id: 'v1' });
    setVehicles([]);
  });

  it('wählt für ein gespeichertes Boot die Boot-Vorlage vor', async () => {
    const user = userEvent.setup();
    setVehicles([
      vehicle({
        id: 'v1',
        name: 'MZB',
        counters: reordered(VEHICLE_PRESETS.boot),
        sortOrder: 205,
      }),
    ]);
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(
      screen.getByRole('button', { name: 'Fahrzeug bearbeiten: MZB' }),
    );

    expect(
      screen.getByText('Boot (Betriebsstunden, Lenzpumpen)'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/entsprechen keiner Vorlage/),
    ).not.toBeInTheDocument();
  });

  it('wählt für ein neues Fahrzeug die Fahrzeug-Vorlage vor', async () => {
    const user = userEvent.setup();
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(screen.getByRole('button', { name: 'Fahrzeug anlegen' }));

    expect(screen.getByText('Fahrzeug (Kilometer)')).toBeInTheDocument();
  });

  it('warnt, wenn die vorhandenen Zähler zu keiner Vorlage passen', async () => {
    const user = userEvent.setup();
    setVehicles([
      vehicle({
        id: 'v1',
        name: 'Sonderfahrzeug',
        counters: [
          {
            id: 'schaum',
            label: 'Schaumzähler',
            unit: 'l',
            mode: 'reading',
            changeWarning: 'none',
            required: false,
          },
        ],
      }),
    ]);
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(
      screen.getByRole('button', {
        name: 'Fahrzeug bearbeiten: Sonderfahrzeug',
      }),
    );

    expect(
      screen.getByText(/entsprechen keiner Vorlage/),
    ).toBeInTheDocument();
  });

  it('vergibt für ein neues Fahrzeug eine sortOrder hinter dem Bestand', async () => {
    const user = userEvent.setup();
    setVehicles([
      vehicle({ id: 'v1', name: 'KDTFA', sortOrder: 101 }),
      vehicle({ id: 'v2', name: 'MZB', sortOrder: 208 }),
    ]);
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(screen.getByRole('button', { name: 'Fahrzeug anlegen' }));
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'MTF');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(saveFahrtenbuchVehicle).toHaveBeenCalledWith(
      'g1',
      undefined,
      expect.objectContaining({ name: 'MTF', sortOrder: 209 }),
    );
  });

  it('meldet einen Transportfehler beim Speichern', async () => {
    const user = userEvent.setup();
    saveFahrtenbuchVehicle.mockRejectedValue(new Error('offline'));
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(screen.getByRole('button', { name: 'Fahrzeug anlegen' }));
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'MTF');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Speichern fehlgeschlagen: offline'),
    ).toBeInTheDocument();
  });
});
