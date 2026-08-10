// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMangelMock, updateMangelMock, changeMangelStatusMock } =
  vi.hoisted(() => ({
    createMangelMock: vi.fn(),
    updateMangelMock: vi.fn(),
    changeMangelStatusMock: vi.fn(),
  }));

vi.mock('./mangelActions', () => ({
  createMangel: createMangelMock,
  updateMangel: updateMangelMock,
  changeMangelStatus: changeMangelStatusMock,
}));

import {
  VEHICLE_PRESETS,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import type { Mangel } from '../../common/mangel';
import { renderWithIntl } from '../../test-utils/intlRender';
import MangelDialog from './MangelDialog';

const vehicles: FahrtenbuchVehicle[] = [
  {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  },
];

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

/** Wählt einen Wert in einem MUI-Select-TextField. */
async function selectOption(label: string | RegExp, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(screen.getByRole('option', { name: option }));
}

beforeEach(() => {
  vi.clearAllMocks();
  createMangelMock.mockResolvedValue({ success: true, id: 'm1' });
  updateMangelMock.mockResolvedValue({ success: true, id: 'm1' });
  changeMangelStatusMock.mockResolvedValue({ success: true, id: 'm1' });
});

describe('MangelDialog — anlegen', () => {
  it('legt einen Mangel mit Fahrzeug und Beschreibung an', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        vehicleId="v1"
        onClose={onClose}
      />,
    );

    await userEvent.type(
      screen.getByLabelText(/Mangelbeschreibung/),
      'Kupplung rutscht',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(createMangelMock).toHaveBeenCalledWith('ffnd', {
        vehicleId: 'v1',
        description: 'Kupplung rutscht',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('zeigt beim Anlegen weder Status noch Verlauf', () => {
    // Ein neuer Mangel ist offen — die Action verwirft eine andere Angabe
    // ohnehin, und ein Auswahlfeld ohne Wirkung ist irreführend.
    renderWithIntl(
      <MangelDialog open groupId="ffnd" vehicles={vehicles} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.queryByText('Verlauf')).toBeNull();
  });

  it('sperrt das Speichern ohne Beschreibung', () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        vehicleId="v1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('schließt nicht, wenn das Anlegen scheitert', async () => {
    createMangelMock.mockResolvedValue({
      success: false,
      error: 'descriptionMissing',
    });
    const onClose = vi.fn();
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        vehicleId="v1"
        onClose={onClose}
      />,
    );

    await userEvent.type(screen.getByLabelText(/Mangelbeschreibung/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(screen.getByText('Bitte den Mangel beschreiben.')).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MangelDialog — bearbeiten', () => {
  it('setzt den Status und hängt die Notiz an', async () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel()}
        onClose={vi.fn()}
      />,
    );

    await selectOption('Status', 'In Arbeit');
    await userEvent.type(
      screen.getByLabelText(/Notiz hinzufügen/),
      'Werkstatttermin am 12.8.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(changeMangelStatusMock).toHaveBeenCalledWith(
        'ffnd',
        'm1',
        'inProgress',
        expect.objectContaining({ note: 'Werkstatttermin am 12.8.' }),
      ),
    );
    // Die Beschreibung wurde nicht angefasst — kein Update-Aufruf.
    expect(updateMangelMock).not.toHaveBeenCalled();
  });

  it('zeigt das Behebungsdatum erst bei „behoben“ und belegt es vor', async () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Behoben am')).toBeNull();
    await selectOption('Status', 'Behoben');

    const field = screen.getByLabelText('Behoben am') as HTMLInputElement;
    // Vorbelegt mit „jetzt", damit der Regelfall ohne Tippen auskommt — und
    // korrigierbar, weil ein Nachtrag sonst ein falsches Datum bekäme.
    expect(field.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('übernimmt ein korrigiertes Behebungsdatum', async () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel()}
        onClose={vi.fn()}
      />,
    );

    await selectOption('Status', 'Behoben');
    const field = screen.getByLabelText('Behoben am');
    await userEvent.clear(field);
    await userEvent.type(field, '2026-08-03T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(changeMangelStatusMock).toHaveBeenCalled());
    const options = changeMangelStatusMock.mock.calls[0][3];
    expect(new Date(options.resolvedAt).getFullYear()).toBe(2026);
    // Der Wert des Feldes ist Ortszeit, gespeichert wird UTC — ohne die
    // Umrechnung spränge das Datum um den Zeitzonenversatz.
    expect(options.resolvedAt).toBe(new Date('2026-08-03T12:00').toISOString());
  });

  it('korrigiert die Beschreibung über einen eigenen Aufruf', async () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel()}
        onClose={vi.fn()}
      />,
    );

    const field = screen.getByLabelText(/Mangelbeschreibung/);
    await userEvent.clear(field);
    await userEvent.type(field, 'Blinker vorne rechts defekt');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(updateMangelMock).toHaveBeenCalledWith('ffnd', 'm1', {
        description: 'Blinker vorne rechts defekt',
      }),
    );
  });

  it('zeigt den Verlauf mit Autor, Zeit und Statuswechsel', () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel({
          notes: [
            {
              text: 'Werkstatttermin am 12.8.',
              status: 'inProgress',
              at: '2026-08-02T09:00:00.000Z',
              by: 'u1',
              byName: 'Anna Muster',
            },
          ],
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Anna Muster/)).toBeInTheDocument();
    expect(screen.getByText('Werkstatttermin am 12.8.')).toBeInTheDocument();
    expect(screen.getByText('Status: In Arbeit')).toBeInTheDocument();
  });

  it('meldet einen leeren Verlauf, statt nichts zu zeigen', () => {
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Noch keine Einträge im Verlauf.'),
    ).toBeInTheDocument();
  });

  it('lässt das Fahrzeug beim Bearbeiten unverändert', () => {
    // Ein Mangel wandert nicht von einem Fahrzeug zum anderen — dafür gibt es
    // Löschen und neu melden.
    renderWithIntl(
      <MangelDialog
        open
        groupId="ffnd"
        vehicles={vehicles}
        mangel={mangel()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Fahrzeug' })).toBeNull();
    expect(screen.getByText('RLFA 2000')).toBeInTheDocument();
  });
});
