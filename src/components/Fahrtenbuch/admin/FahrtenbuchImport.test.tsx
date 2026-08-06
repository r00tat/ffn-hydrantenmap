// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../../common/fahrtenbuch';
import { renderWithIntl } from '../../../test-utils/intlRender';
import type { PdfFahrtRow, PdfParseResult } from '../fahrtenbuchPdfImport';

const vehicle: FahrtenbuchVehicle = {
  id: 'v1',
  name: 'RLFA 2000',
  kennzeichen: 'ND-12345',
  active: true,
  counters: VEHICLE_PRESETS.fahrzeug,
  fuelTypes: ['diesel'],
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const person: FahrtenbuchPerson = {
  id: 'p1',
  name: 'Max Mustermann',
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

/** Die Fahrt vom 03.03. steht schon im Bestand — Grundlage der Dublette. */
const existingEntry: FahrtenbuchEntry = {
  id: 'e1',
  vehicleId: 'v1',
  vehicleName: 'RLFA 2000',
  driverName: 'Max Mustermann',
  zweck: 'einsatz',
  ziel: 'Neusiedl',
  abfahrt: new Date(2026, 2, 3, 8, 0).toISOString(),
  ankunft: new Date(2026, 2, 3, 9, 0).toISOString(),
  counters: { km: { start: 1040, end: 1060 } },
  group: 'g1',
  deleted: false,
  createdAt: '',
  createdBy: '',
  createdByName: '',
  updatedAt: '',
  updatedBy: '',
};

function row(overrides: Partial<PdfFahrtRow> & { line: number }): PdfFahrtRow {
  return {
    datum: '01.03.2026',
    von: '08:00',
    bis: '09:00',
    fahrer: 'Max Mustermann',
    grund: 'Einsatz',
    zweckStrecke: 'Neusiedl',
    startKm: 1000,
    endeKm: 1020,
    notizen: '',
    raw: 'Rohzeile',
    ...overrides,
  };
}

/**
 * Ein Ergebnis, das je einen der vier Zustände auslöst — die Zuordnung selbst
 * macht die echte `planFahrtenbuchImport`, damit der Test die Vorauswahl und
 * nicht eine nachgebaute Zustandslogik prüft.
 */
const parseResult: PdfParseResult = {
  vehicleName: 'RLFA 2000',
  kennzeichen: 'ND-12345',
  rows: [
    row({ line: 1 }),
    row({ line: 2, datum: '02.03.2026', startKm: 1020, endeKm: 1040 }),
    row({ line: 3, datum: '03.03.2026', startKm: 1040, endeKm: 1060 }),
    row({ line: 4, datum: '04.03.2026', fahrer: 'Erika Unbekannt' }),
    row({
      line: 5,
      datum: '05.03.2026',
      fahrer: 'Max Mustermann',
      startKm: undefined,
      endeKm: undefined,
      problem: 'kmMissing',
      raw: '05.03.2026 Max Mustermann Einsatz ohne Kilometerstand',
    }),
  ],
};

// `fahrtenbuchActions` und `stammdatenActions` sind 'use server'/'server-only'
// und lassen sich im Test nicht laden.
const { importFahrtenbuchEntries, createInactivePersons } = vi.hoisted(() => ({
  importFahrtenbuchEntries: vi.fn(),
  createInactivePersons: vi.fn(),
}));
vi.mock('../fahrtenbuchActions', () => ({ importFahrtenbuchEntries }));
vi.mock('../stammdatenActions', () => ({ createInactivePersons }));

// Nur die beiden PDF-Schritte werden ersetzt; `toIsoTimestamp` bleibt echt,
// weil `fahrtenbuchImportPlan` es aus demselben Modul bezieht.
const { extractPdfItems, parseFahrtenbuchPdf } = vi.hoisted(() => ({
  extractPdfItems: vi.fn(),
  parseFahrtenbuchPdf: vi.fn(),
}));
vi.mock('../fahrtenbuchPdfImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fahrtenbuchPdfImport')>()),
  extractPdfItems,
  parseFahrtenbuchPdf,
}));

vi.mock('../../../hooks/useFahrtenbuchVehicles', () => ({
  default: () => ({
    vehicles: [vehicle],
    activeVehicles: [vehicle],
    vehiclesById: new Map([['v1', vehicle]]),
  }),
}));
vi.mock('../../../hooks/useFahrtenbuchPersons', () => ({
  default: () => ({ persons: [person], activePersons: [person] }),
}));
vi.mock('../../../hooks/useFahrtenbuchEntries', () => ({
  default: () => [existingEntry],
}));

import FahrtenbuchImport from './FahrtenbuchImport';

/** Wählt die Datei über den versteckten Eingabefeld des „PDF wählen"-Buttons. */
async function chooseFile() {
  const input = screen.getByLabelText('PDF wählen');
  // `fireEvent` statt `userEvent.upload`: das Feld ist bewusst versteckt.
  fireEvent.change(input, {
    target: {
      files: [new File(['%PDF-1.7'], 'fahrtenbuch.pdf', { type: 'application/pdf' })],
    },
  });
  // Die Vorschau erscheint erst, nachdem das Lesen der Datei aufgelöst ist.
  await screen.findByLabelText('01.03.2026 Max Mustermann');
}

function renderPanel() {
  return renderWithIntl(
    <FahrtenbuchImport groupId="g1" groupName="FF Neusiedl am See" />,
  );
}

describe('FahrtenbuchImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractPdfItems.mockResolvedValue([]);
    parseFahrtenbuchPdf.mockReturnValue(parseResult);
    importFahrtenbuchEntries.mockResolvedValue({
      success: true,
      created: 2,
      duplicates: 0,
      failed: 0,
    });
    createInactivePersons.mockResolvedValue({
      success: true,
      personIds: { 'erika unbekannt': 'p9' },
      created: 1,
    });
  });

  it('wählt nur vollständige Zeilen vor', async () => {
    // Ein Fahrtenbuch ist ein Nachweisdokument: Dubletten und Problemzeilen
    // bleiben sichtbar, aber unangehakt. Eine Zeile mit unbekanntem Fahrer ist
    // dagegen vollständig — für ihren Fahrer entsteht eine Person.
    renderPanel();
    await chooseFile();

    expect(screen.getByLabelText('01.03.2026 Max Mustermann')).toBeChecked();
    expect(screen.getByLabelText('02.03.2026 Max Mustermann')).toBeChecked();
    expect(screen.getByLabelText('03.03.2026 Max Mustermann')).not.toBeChecked();
    expect(screen.getByLabelText('04.03.2026 Erika Unbekannt')).toBeChecked();
    expect(screen.getByLabelText('05.03.2026 Max Mustermann')).not.toBeChecked();

    expect(screen.getByText('bereits vorhanden')).toBeInTheDocument();
    expect(screen.getByText('Fahrer unbekannt')).toBeInTheDocument();
    expect(
      screen.getByText(/werden als deaktivierte Personen angelegt: Erika Unbekannt/),
    ).toBeInTheDocument();
  });

  it('zeigt bei einer Problemzeile den Rohtext', async () => {
    // Ohne den Rohtext ist nicht nachvollziehbar, was nicht gelesen wurde.
    renderPanel();
    await chooseFile();

    expect(
      screen.getByText('05.03.2026 Max Mustermann Einsatz ohne Kilometerstand'),
    ).toBeInTheDocument();
    expect(screen.getByText('Kilometerstand fehlt')).toBeInTheDocument();
  });

  it('übernimmt genau die angehakten Zeilen', async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    // Zwei der vorausgewählten Zeilen abwählen, eine bleibt übrig.
    await user.click(screen.getByLabelText('02.03.2026 Max Mustermann'));
    await user.click(screen.getByLabelText('04.03.2026 Erika Unbekannt'));
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(importFahrtenbuchEntries).toHaveBeenCalled());
    const [groupId, inputs] = importFahrtenbuchEntries.mock.calls[0];
    expect(groupId).toBe('g1');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      vehicleId: 'v1',
      driverId: 'p1',
      counters: { km: { start: 1000, end: 1020 } },
    });
    // Kein unbekannter Fahrer mehr in der Auswahl — dann darf der Import auch
    // keine Person anlegen.
    expect(createInactivePersons).not.toHaveBeenCalled();
  });

  it('legt unbekannte Fahrer als deaktivierte Person an und verknüpft sie', async () => {
    // Der Fall „ehemaliger Fahrer": Die Fahrt darf nicht an einem bloßen Namen
    // hängen bleiben, die Person aber auch nicht wieder auswählbar werden.
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(importFahrtenbuchEntries).toHaveBeenCalled());
    expect(createInactivePersons).toHaveBeenCalledWith('g1', ['Erika Unbekannt']);
    const inputs = importFahrtenbuchEntries.mock.calls[0][1];
    expect(inputs).toHaveLength(3);
    expect(inputs[2]).toMatchObject({
      driverName: 'Erika Unbekannt',
      driverId: 'p9',
    });
    expect(
      await screen.findByText(/als deaktivierte Person angelegt/),
    ).toBeInTheDocument();
  });

  it('importiert nichts, wenn die Personen nicht angelegt werden konnten', async () => {
    // Sonst stünden Fahrten mit unverknüpftem Fahrer im Fahrtenbuch, und der
    // zweite Anlauf hinge an der Dublettenprüfung.
    createInactivePersons.mockResolvedValue({
      success: false,
      personIds: {},
      created: 0,
      error: 'tooManyPersons',
    });
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    expect(
      await screen.findByText(/Zu viele unbekannte Fahrer/),
    ).toBeInTheDocument();
    expect(importFahrtenbuchEntries).not.toHaveBeenCalled();
  });

  it('importiert nichts, wenn alles abgewählt ist', async () => {
    // Der gefährliche Fall: „nichts angehakt" darf nicht auf die Vorauswahl
    // zurückfallen und stillschweigend alle Zeilen schreiben.
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByLabelText('01.03.2026 Max Mustermann'));
    await user.click(screen.getByLabelText('02.03.2026 Max Mustermann'));
    await user.click(screen.getByLabelText('04.03.2026 Erika Unbekannt'));

    const run = screen.getByRole('button', { name: 'Übernehmen' });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(importFahrtenbuchEntries).not.toHaveBeenCalled();
  });

  it('korrigiert den Fahrer einer Zeile vor dem Import', async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByRole('button', { name: 'Zeile 4 bearbeiten' }));
    const driver = screen.getByRole('combobox', { name: 'Fahrer' });
    await user.clear(driver);
    await user.type(driver, 'Max Mustermann');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // Der korrigierte Fahrer ist bekannt: keine Person mehr anzulegen.
    expect(screen.getByText('bearbeitet')).toBeInTheDocument();
    expect(screen.queryByText('Fahrer unbekannt')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() => expect(importFahrtenbuchEntries).toHaveBeenCalled());
    expect(createInactivePersons).not.toHaveBeenCalled();
    const inputs = importFahrtenbuchEntries.mock.calls[0][1];
    expect(inputs).toHaveLength(3);
    expect(inputs[2]).toMatchObject({
      driverName: 'Max Mustermann',
      driverId: 'p1',
    });
  });

  it('macht eine Problemzeile durch nachgetragene Kilometer übernehmbar', async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    expect(screen.getByLabelText('05.03.2026 Max Mustermann')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Zeile 5 bearbeiten' }));
    await user.type(screen.getByLabelText('Kilometer Start'), '1060');
    await user.type(screen.getByLabelText('Kilometer Ende'), '1075');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // Die korrigierte Zeile hakt sich selbst an — wer sie anfasst, will sie
    // übernehmen.
    expect(screen.getByLabelText('05.03.2026 Max Mustermann')).toBeChecked();
    expect(screen.queryByText('Kilometerstand fehlt')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() => expect(importFahrtenbuchEntries).toHaveBeenCalled());
    const inputs = importFahrtenbuchEntries.mock.calls[0][1];
    expect(inputs).toHaveLength(4);
    expect(inputs[3]).toMatchObject({
      counters: { km: { start: 1060, end: 1075 } },
    });
  });

  it('nimmt eine Korrektur über den Dialog wieder zurück', async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByRole('button', { name: 'Zeile 1 bearbeiten' }));
    await user.clear(screen.getByLabelText('Fahrstrecke / Ziel'));
    await user.type(screen.getByLabelText('Fahrstrecke / Ziel'), 'Podersdorf');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Podersdorf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zeile 1 bearbeiten' }));
    await user.click(screen.getByRole('button', { name: 'Korrektur verwerfen' }));

    expect(screen.queryByText('Podersdorf')).not.toBeInTheDocument();
    expect(screen.queryByText('bearbeitet')).not.toBeInTheDocument();
  });

  it('verwirft Datei, Vorschau und Auswahl über das Zurücksetzen', async () => {
    // Im Panel gibt es kein Schließen — ohne diesen Weg käme man von einer
    // geladenen Datei nicht mehr zu einer anderen.
    const user = userEvent.setup();
    renderPanel();
    expect(
      screen.queryByRole('button', { name: 'Zurücksetzen' }),
    ).not.toBeInTheDocument();

    await chooseFile();
    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));

    expect(
      screen.queryByLabelText('01.03.2026 Max Mustermann'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Zurücksetzen' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
  });

  it('räumt auch die Meldung eines gelaufenen Imports weg', async () => {
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    const message = await screen.findByText(/2 Fahrten übernommen/);
    expect(message).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.queryByText(/2 Fahrten übernommen/)).not.toBeInTheDocument();
  });

  it('verlangt ein Fahrzeug, wenn der Titel keines trifft', async () => {
    parseFahrtenbuchPdf.mockReturnValue({
      ...parseResult,
      vehicleName: 'Unbekanntes Fahrzeug',
      kennzeichen: 'ND-99999',
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText('PDF wählen'), {
      target: {
        files: [new File(['%PDF-1.7'], 'fahrtenbuch.pdf', { type: 'application/pdf' })],
      },
    });

    expect(
      await screen.findByText(/Unbekanntes Fahrzeug ND-99999/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
  });

  it('übersetzt einen bekannten Fehlerschlüssel der Server Action', async () => {
    // „tooManyEntries" mitten im Satz ist für einen Admin kein Satz.
    importFahrtenbuchEntries.mockResolvedValue({
      success: false,
      created: 0,
      duplicates: 0,
      failed: 0,
      error: 'tooManyEntries',
    });
    const user = userEvent.setup();
    renderPanel();
    await chooseFile();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    expect(
      await screen.findByText(/Zu viele Fahrten auf einmal/),
    ).toBeInTheDocument();
  });
});
