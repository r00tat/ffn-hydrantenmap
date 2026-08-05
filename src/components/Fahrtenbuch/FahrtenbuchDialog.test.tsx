// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';
import FahrtenbuchDialog from './FahrtenbuchDialog';

vi.mock('./fahrtenbuchActions', () => ({
  createFahrtenbuchEntry: vi.fn().mockResolvedValue({ success: true }),
  updateFahrtenbuchEntry: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  createFahrtenbuchEntry,
  updateFahrtenbuchEntry,
} from './fahrtenbuchActions';

const createMock = vi.mocked(createFahrtenbuchEntry);
const updateMock = vi.mocked(updateFahrtenbuchEntry);

function vehicle(overrides: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    lastCounters: { km: 1000 },
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const boot = vehicle({
  id: 'v2',
  name: 'MZB',
  counters: VEHICLE_PRESETS.boot,
  fuelTypes: ['benzin'],
  lastCounters: { betriebsstundenBb: 120, lenzpumpeStb: 39, lenzpumpeBb: 39 },
});

const baseProps = {
  open: true,
  groupId: 'ffnd',
  vehicles: [vehicle()],
  persons: [],
  firecalls: [{ id: 'f1', name: 'Brand B2', date: '2026-08-03T10:00:00.000Z' }],
  onClose: vi.fn(),
};

function entry(overrides: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Mustermann',
    zweck: 'sonstiges',
    ziel: '',
    abfahrt: '2026-08-03T10:00:00.000Z',
    ankunft: '2026-08-03T11:00:00.000Z',
    counters: {},
    group: 'ffnd',
    deleted: false,
    createdAt: '',
    createdBy: 'u1',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const existingEntry: FahrtenbuchEntry = entry({
  zweck: 'einsatz',
  firecallId: 'f1',
  firecallName: 'Brand B2',
  ziel: 'Hauptplatz',
  counters: { km: { start: 1000, end: 1042, diff: 42 } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FahrtenbuchDialog', () => {
  it('belegt den Startzähler aus lastCounters vor', () => {
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);
    expect(screen.getByLabelText(/Kilometerstand — Start/)).toHaveValue(1000);
  });

  it('lässt den Endzähler leer', () => {
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);
    expect(screen.getByLabelText(/Kilometerstand — Ende/)).toHaveValue(null);
  });

  it('zeigt für ein Boot keine Kilometerfelder, aber die Lenzpumpen', () => {
    renderWithIntl(
      <FahrtenbuchDialog {...baseProps} vehicles={[boot]} vehicleId="v2" />,
    );
    expect(screen.queryByText(/Kilometerstand/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Lenzpumpe Backbord/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Lenzpumpe Steuerbord/)).toBeInTheDocument();
  });

  it('belegt die Zähler nach einem Fahrzeugwechsel neu vor', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        vehicles={[vehicle(), boot]}
        vehicleId="v1"
      />,
    );
    await user.click(screen.getByLabelText('Fahrzeug'));
    await user.click(screen.getByRole('option', { name: 'MZB' }));

    expect(screen.queryByText('Kilometerstand')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/Betriebsstunden Backbordmotor — Start/),
    ).toHaveValue(120);
  });

  it('zeigt nur die am Fahrzeug hinterlegten Betriebsmittel', () => {
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);
    expect(screen.getByLabelText(/Diesel/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/AdBlue/)).not.toBeInTheDocument();
  });

  it('zeigt die Einsatzauswahl nicht beim Standard-Zweck Sonstiges', () => {
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);
    expect(screen.queryByLabelText('Einsatz')).not.toBeInTheDocument();
  });

  it('zeigt die Einsatzauswahl, sobald der Zweck Einsatz ist', () => {
    renderWithIntl(<FahrtenbuchDialog {...baseProps} entry={existingEntry} />);
    expect(screen.getByLabelText('Einsatz')).toBeInTheDocument();
  });

  it('blendet die Einsatzauswahl ein, wenn der Zweck auf Einsatz gestellt wird', async () => {
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);
    await user.click(screen.getByLabelText('Fahrtzweck'));
    await user.click(screen.getByRole('option', { name: 'Einsatz' }));
    expect(screen.getByLabelText('Einsatz')).toBeInTheDocument();
  });

  it('speichert einen neuen Eintrag ohne vehicleName', async () => {
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);

    await user.type(screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [groupId, input] = createMock.mock.calls[0];
    expect(groupId).toBe('ffnd');
    expect(input).not.toHaveProperty('vehicleName');
    expect(input.vehicleId).toBe('v1');
    expect(input.driverName).toBe('Max Mustermann');
    expect(input.zweck).toBe('sonstiges');
    expect(input.counters.km).toMatchObject({ start: 1000, end: 1042 });
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('speichert eine Bearbeitung über updateFahrtenbuchEntry', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        entry={existingEntry}
        entries={[existingEntry]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [groupId, entryId, input] = updateMock.mock.calls[0];
    expect(groupId).toBe('ffnd');
    expect(entryId).toBe('e1');
    expect(input).not.toHaveProperty('vehicleName');
    expect(input.firecallName).toBe('Brand B2');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('warnt bei fallendem Zählerstand, blockiert das Speichern aber nicht', async () => {
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);

    await user.type(screen.getByLabelText('Fahrer'), 'Max Mustermann');
    const startField = screen.getByLabelText(/Kilometerstand — Start/);
    await user.clear(startField);
    await user.type(startField, '900');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '950');

    expect(
      screen.getByText(/Letzter bekannter Stand: 1000 km/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
  });

  it('verhindert das Speichern ohne Fahrer', async () => {
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);

    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Bitte einen Fahrer angeben.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('meldet einen fehlenden Pflichtzähler mit Zählernamen', async () => {
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);

    await user.type(screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Kilometerstand fehlt.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('übersetzt einen bekannten Fehlerschlüssel der Server Action', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: 'notInGroup' });
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);

    await user.type(screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Du bist kein Mitglied dieser Gruppe.'),
    ).toBeInTheDocument();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it('zeigt einen unbekannten Fehler der Server Action als Text an', async () => {
    createMock.mockResolvedValueOnce({
      success: false,
      error: 'PERMISSION_DENIED',
    });
    const user = userEvent.setup();
    renderWithIntl(<FahrtenbuchDialog {...baseProps} vehicleId="v1" />);

    await user.type(screen.getByLabelText('Fahrer'), 'Max Mustermann');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText(/Speichern fehlgeschlagen: PERMISSION_DENIED/),
    ).toBeInTheDocument();
  });

  it('übernimmt bei Auswahl aus der Liste ID und Namen', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        vehicleId="v1"
        firecalls={[{ id: 'f1', name: 'B1 Kaminbrand' }]}
      />,
    );

    await user.click(screen.getByLabelText('Fahrtzweck'));
    await user.click(await screen.findByRole('option', { name: 'Einsatz' }));
    await user.click(screen.getByLabelText('Einsatz'));
    await user.click(await screen.findByRole('option', { name: 'B1 Kaminbrand' }));

    await user.type(screen.getByLabelText('Fahrer'), 'Paul');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toMatchObject({
      firecallId: 'f1',
      firecallName: 'B1 Kaminbrand',
    });
  });

  it('speichert einen frei eingegebenen Einsatz ohne ID', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        vehicleId="v1"
        firecalls={[{ id: 'f1', name: 'B1 Kaminbrand' }]}
      />,
    );

    await user.click(screen.getByLabelText('Fahrtzweck'));
    await user.click(await screen.findByRole('option', { name: 'Einsatz' }));
    await user.type(screen.getByLabelText('Einsatz'), 'N/S Ölspur Hauptstraße');

    await user.type(screen.getByLabelText('Fahrer'), 'Paul');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toMatchObject({
      firecallId: undefined,
      firecallName: 'N/S Ölspur Hauptstraße',
    });
  });

  it('verknüpft nicht heimlich, nur weil der getippte Name zufällig zu einem Listeneintrag passt', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        vehicleId="v1"
        firecalls={[{ id: 'f1', name: 'B1 Kaminbrand' }]}
      />,
    );

    await user.click(screen.getByLabelText('Fahrtzweck'));
    await user.click(await screen.findByRole('option', { name: 'Einsatz' }));
    // Tippen, nicht auswählen — trotz exakt gleichlautendem Listeneintrag darf
    // daraus keine Verknüpfung entstehen.
    await user.type(screen.getByLabelText('Einsatz'), 'B1 Kaminbrand');

    await user.type(screen.getByLabelText('Fahrer'), 'Paul');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toMatchObject({
      firecallId: undefined,
      firecallName: 'B1 Kaminbrand',
    });
  });

  it('zeigt beim Bearbeiten den gespeicherten Einsatznamen ohne passende ID', () => {
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        firecalls={[]}
        entry={entry({ zweck: 'einsatz', firecallName: 'Altbestand Ölspur' })}
      />,
    );

    expect(screen.getByLabelText('Einsatz')).toHaveValue('Altbestand Ölspur');
  });

  it('verwirft den Einsatzbezug, wenn der Zweck nicht Einsatz ist', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FahrtenbuchDialog
        {...baseProps}
        vehicleId="v1"
        firecalls={[{ id: 'f1', name: 'B1 Kaminbrand' }]}
      />,
    );

    await user.click(screen.getByLabelText('Fahrtzweck'));
    await user.click(await screen.findByRole('option', { name: 'Einsatz' }));
    await user.click(screen.getByLabelText('Einsatz'));
    await user.click(await screen.findByRole('option', { name: 'B1 Kaminbrand' }));
    await user.click(screen.getByLabelText('Fahrtzweck'));
    await user.click(await screen.findByRole('option', { name: 'Übung' }));

    await user.type(screen.getByLabelText('Fahrer'), 'Paul');
    await user.type(screen.getByLabelText(/Kilometerstand — Ende/), '1042');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][1]).toMatchObject({
      firecallId: undefined,
      firecallName: undefined,
    });
  });
});
