// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
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

// Vom QR-Dialog importiert — ebenfalls 'use server'/'server-only'.
const { getFahrtenbuchShareLink } = vi.hoisted(() => ({
  getFahrtenbuchShareLink: vi.fn(),
}));

vi.mock('../shareLinkActions', () => ({
  getFahrtenbuchShareLink,
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
    getFahrtenbuchShareLink.mockResolvedValue({
      url: 'https://einsatz.example/fahrtenbuch/teilen/tok123',
      createdAt: '2026-08-04T10:00:00.000Z',
      createdByName: 'Paul',
    });
    setVehicles([]);
  });

  it('öffnet den QR-Code des Fahrzeugs aus der Liste', async () => {
    const user = userEvent.setup();
    setVehicles([vehicle({ id: 'v2', name: 'MTF' })]);
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="FF Neusiedl" />);

    await user.click(
      screen.getByRole('button', { name: 'QR-Code für dieses Fahrzeug: MTF' }),
    );

    // Der Link trägt genau dieses Fahrzeug — ein Aufkleber im MTF darf nicht
    // den allgemeinen Code der Gruppe zeigen.
    expect(
      await screen.findByText(
        'https://einsatz.example/fahrtenbuch/teilen/tok123?fahrzeug=v2',
      ),
    ).toBeInTheDocument();
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

  it('leitet die Kategorie eines Anhängers aus dem Namen ab', async () => {
    // Die gewachsenen Fahrzeuge haben das Feld nicht. Ohne Ableitung stünde im
    // Dialog „Fahrzeug", und ein Speichern schriebe das falsch fest.
    const user = userEvent.setup();
    setVehicles([vehicle({ id: 'v1', name: 'ATS-Anhänger' })]);
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(
      screen.getByRole('button', {
        name: 'Fahrzeug bearbeiten: ATS-Anhänger',
      }),
    );

    expect(screen.getByLabelText('Kategorie')).toHaveTextContent('Anhänger');
  });

  it('speichert die gewählte Kategorie', async () => {
    const user = userEvent.setup();
    setVehicles([vehicle({ id: 'v1', name: 'Mehrzweckboot' })]);
    renderWithIntl(<VehicleAdmin groupId="g1" groupName="g1" />);

    await user.click(
      screen.getByRole('button', { name: 'Fahrzeug bearbeiten: Mehrzweckboot' }),
    );
    await user.click(screen.getByLabelText('Kategorie'));
    await user.click(await screen.findByRole('option', { name: 'Fahrzeug' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // Die ausdrückliche Wahl schlägt die Ableitung aus dem Namen.
    await waitFor(() =>
      expect(saveFahrtenbuchVehicle).toHaveBeenCalledWith(
        'g1',
        'v1',
        expect.objectContaining({ kategorie: 'fahrzeug' }),
      ),
    );
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
