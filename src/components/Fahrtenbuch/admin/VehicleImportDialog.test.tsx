// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';
import { planVehicleImport } from '../stammdatenLogic';

// `stammdatenActions` ist eine 'use server'/'server-only'-Datei und lässt sich
// im Test nicht laden — die beiden Actions werden ersetzt.
const { previewVehicleImport, importVehiclesFromKostenersatz } = vi.hoisted(
  () => ({
    previewVehicleImport: vi.fn(),
    importVehiclesFromKostenersatz: vi.fn(),
  }),
);

vi.mock('../stammdatenActions', () => ({
  previewVehicleImport,
  importVehiclesFromKostenersatz,
}));

import VehicleImportDialog from './VehicleImportDialog';

/** Zeilen entstehen wie im Server über die echte Planungslogik. */
const rows = planVehicleImport(
  [
    { id: 'k1', name: 'KDTFA' },
    { id: 'k2', name: 'MZB' },
    { id: 'k3', name: 'WLA Ölwehr' },
  ],
  [
    {
      id: 'v1',
      name: 'KDTFA',
      active: true,
      counters: [],
      fuelTypes: [],
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: '',
    },
  ],
);

describe('VehicleImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewVehicleImport.mockResolvedValue({ success: true, rows });
    importVehiclesFromKostenersatz.mockResolvedValue({
      success: true,
      created: 2,
      skipped: 0,
    });
  });

  it('wählt nur noch nicht importierte Fahrzeuge vor', async () => {
    renderWithIntl(<VehicleImportDialog groupId="g1" onClose={vi.fn()} />);

    const kdtfa = await screen.findByLabelText('KDTFA');
    expect(kdtfa).toBeDisabled();
    expect(kdtfa).not.toBeChecked();

    expect(screen.getByLabelText('MZB')).toBeChecked();
    expect(screen.getByLabelText('WLA Ölwehr')).toBeChecked();
  });

  it('zeigt je Zeile das aus dem Namen abgeleitete Preset', async () => {
    renderWithIntl(<VehicleImportDialog groupId="g1" onClose={vi.fn()} />);
    await screen.findByLabelText('MZB');

    // MZB → Boot, WLA → ohne Zähler, alles andere → Fahrzeug.
    expect(
      screen.getByText('Boot (Betriebsstunden, Lenzpumpen)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ohne Zähler')).toBeInTheDocument();
    expect(screen.getByText('Fahrzeug (Kilometer)')).toBeInTheDocument();
  });

  it('importiert die Auswahl und meldet das Ergebnis', async () => {
    const user = userEvent.setup();
    renderWithIntl(<VehicleImportDialog groupId="g1" onClose={vi.fn()} />);
    await screen.findByLabelText('MZB');

    await user.click(screen.getByLabelText('WLA Ölwehr'));
    await user.click(screen.getByRole('button', { name: 'Importieren' }));

    expect(importVehiclesFromKostenersatz).toHaveBeenCalledWith('g1', [
      { sourceId: 'k2', preset: 'boot' },
    ]);
    expect(
      await screen.findByText('2 Fahrzeuge importiert, 0 übersprungen'),
    ).toBeInTheDocument();
  });

  it('meldet einen Fehler aus der Vorschau', async () => {
    previewVehicleImport.mockResolvedValue({
      success: false,
      rows: [],
      error: 'kaputt',
    });
    renderWithIntl(<VehicleImportDialog groupId="g1" onClose={vi.fn()} />);

    expect(
      await screen.findByText('Laden fehlgeschlagen: kaputt'),
    ).toBeInTheDocument();
  });
});
