// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { EinsatzRow } from './einsatzRows';

// Die Default-Komponente derselben Datei lädt Firestore-Daten; für die reine
// Darstellung genügen Attrappen der Firebase- und Server-Action-Module.
vi.mock('server-only', () => ({}));
vi.mock('../firebase/firebase', () => ({
  default: {},
  firebaseApp: {},
  firestore: { type: 'mock-firestore' },
  db: { type: 'mock-firestore' },
  auth: {},
}));
vi.mock('./fahrtenbuchActions', () => ({
  createFahrtenbuchEntries: vi.fn().mockResolvedValue({
    success: true,
    created: 0,
  }),
  createFahrtenbuchEntry: vi.fn(),
  updateFahrtenbuchEntry: vi.fn(),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ groups: [] }),
}));
vi.mock('../../hooks/useFirebaseCollection', () => ({ default: () => [] }));
vi.mock('../../hooks/useFahrtenbuchVehicles', () => ({
  default: () => ({
    vehicles: [],
    activeVehicles: [],
    vehiclesById: new Map(),
  }),
}));
vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: () => ({ persons: [], activePersons: [] }),
}));
vi.mock('../../hooks/useFahrtenbuchEntries', () => ({ default: () => [] }));

import { EinsatzFahrtenbuchView } from './EinsatzFahrtenbuch';

const vehicle: FahrtenbuchVehicle = {
  id: 'gv1',
  name: 'RLFA 3000/100',
  active: true,
  counters: VEHICLE_PRESETS.fahrzeug,
  fuelTypes: [],
  lastCounters: { km: 1000 },
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const boot: FahrtenbuchVehicle = {
  ...vehicle,
  id: 'gv2',
  name: 'MZB',
  counters: VEHICLE_PRESETS.boot,
  lastCounters: { betriebsstundenBb: 20 },
};

const baseProps = {
  groupId: 'ffnd',
  vehicles: [vehicle],
  isMember: true,
  saving: false,
  onSave: vi.fn(),
  onChangeRow: vi.fn(),
};

function row(overrides: Partial<EinsatzRow> = {}): EinsatzRow {
  return {
    key: 'i1',
    sourceName: 'RLFA 3000/100',
    vehicleId: 'gv1',
    vehicleName: 'RLFA 3000/100',
    driverId: 'p1',
    driverName: 'Max Mustermann',
    abfahrt: '2026-08-03T10:00:00.000Z',
    ankunft: '2026-08-03T12:00:00.000Z',
    counters: { km: { start: 1000 } },
    ...overrides,
  };
}

describe('EinsatzFahrtenbuchView', () => {
  it('weist Nicht-Mitglieder ab', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView {...baseProps} isMember={false} rows={[row()]} />,
    );
    expect(screen.getByText(/kein Mitglied der Gruppe/)).toBeInTheDocument();
    // Keine Einsatzdaten für Fremde
    expect(screen.queryByDisplayValue('Max Mustermann')).not.toBeInTheDocument();
  });

  it('meldet eine Gruppe ohne hinterlegte Fahrzeuge', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView {...baseProps} vehicles={[]} rows={[row()]} />,
    );
    expect(screen.getByText(/keine Fahrzeuge hinterlegt/)).toBeInTheDocument();
  });

  it('meldet, wenn dem Einsatz keine Fahrzeuge zugeordnet sind', () => {
    renderWithIntl(<EinsatzFahrtenbuchView {...baseProps} rows={[]} />);
    expect(screen.getByText(/keine Fahrzeuge zugeordnet/)).toBeInTheDocument();
  });

  it('zeigt den vorbelegten Fahrer und Startzähler', () => {
    renderWithIntl(<EinsatzFahrtenbuchView {...baseProps} rows={[row()]} />);
    expect(screen.getByDisplayValue('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
  });

  it('markiert bereits erfasste Fahrzeuge und bietet das Bearbeiten an', async () => {
    const user = userEvent.setup();
    const onEditEntry = vi.fn();
    const existingEntry = { id: 'e1' } as FahrtenbuchEntry;
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row({ existingEntry })]}
        onEditEntry={onEditEntry}
      />,
    );
    expect(screen.getByText('Bereits erfasst')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /bearbeiten/i }));
    expect(onEditEntry).toHaveBeenCalledWith(existingEntry);
  });

  it('sperrt die Eingabe bereits erfasster Zeilen', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row({ existingEntry: { id: 'e1' } as FahrtenbuchEntry })]}
      />,
    );
    expect(screen.getByDisplayValue('Max Mustermann')).toBeDisabled();
  });

  it('fragt beim Boot Betriebsstunden statt Kilometer ab', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        vehicles={[vehicle, boot]}
        rows={[
          row({
            key: 'i2',
            vehicleId: 'gv2',
            vehicleName: 'MZB',
            sourceName: 'MZB',
            counters: { betriebsstundenBb: { start: 20 } },
          }),
        ]}
      />,
    );
    expect(
      screen.getByLabelText(/Betriebsstunden Backbordmotor — Ende/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Kilometerstand/)).not.toBeInTheDocument();
  });

  it('bietet eine Fahrzeugauswahl für unbekannte Fahrzeuge', async () => {
    const user = userEvent.setup();
    const onChangeRow = vi.fn();
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        onChangeRow={onChangeRow}
        rows={[
          row({
            vehicleId: undefined,
            vehicleName: '',
            sourceName: 'Drehleiter',
            counters: {},
          }),
        ]}
      />,
    );
    await user.click(
      screen.getByRole('combobox', { name: 'Fahrzeug zuordnen' }),
    );
    await user.click(screen.getByRole('option', { name: 'RLFA 3000/100' }));
    expect(onChangeRow).toHaveBeenCalledWith('i1', {
      vehicleId: 'gv1',
      vehicleName: 'RLFA 3000/100',
      counters: { km: { start: 1000 } },
    });
  });

  it('meldet den Endstand über onChangeRow', async () => {
    const user = userEvent.setup();
    const onChangeRow = vi.fn();
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        onChangeRow={onChangeRow}
        rows={[row()]}
      />,
    );
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '5');
    expect(onChangeRow).toHaveBeenCalledWith('i1', {
      counters: { km: { start: 1000, end: 5 } },
    });
  });

  it('zeigt die Rückmeldung nach dem Speichern', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row()]}
        message="1 Fahrt gespeichert"
      />,
    );
    expect(screen.getByText('1 Fahrt gespeichert')).toBeInTheDocument();
  });

  it('nennt zu jeder übersprungenen Zeile den Grund', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row()]}
        message="0 Fahrten gespeichert — 1 unvollständige Zeile übersprungen"
        messageDetails={['RLFA 3000/100: Kilometerstand fehlt.']}
        messageSeverity="warning"
      />,
    );
    expect(
      screen.getByText('RLFA 3000/100: Kilometerstand fehlt.'),
    ).toBeInTheDocument();
  });

  it('sperrt eine Zeile, die nach der Zuordnung als erfasst erkannt wird', () => {
    // Das Zusammenführen in mergeRowEdits setzt existingEntry — die Ansicht
    // muss die Zeile daraufhin genauso behandeln wie eine von Anfang an
    // erfasste.
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[
          row({
            sourceName: 'RLF',
            existingEntry: { id: 'e1' } as FahrtenbuchEntry,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Bereits erfasst')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Kilometerstand — Ende/),
    ).toBeDisabled();
  });

  it('sperrt den Speichern-Button während des Speicherns', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView {...baseProps} rows={[row()]} saving />,
    );
    expect(screen.getByRole('button', { name: 'Alle speichern' })).toBeDisabled();
  });
});
