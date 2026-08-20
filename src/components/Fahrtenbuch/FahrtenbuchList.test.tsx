// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { EMPTY_FAHRTENBUCH_LIST_FILTER } from '../../common/fahrtenbuchListFilter';
import { renderWithIntl } from '../../test-utils/intlRender';
import FahrtenbuchList from './FahrtenbuchList';

function vehicle(
  overrides: Partial<FahrtenbuchVehicle> & Pick<FahrtenbuchVehicle, 'id' | 'name'>,
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

function entry(overrides: Partial<FahrtenbuchEntry>): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Mustermann',
    zweck: 'einsatz',
    ziel: 'Hauptplatz',
    abfahrt: '2026-08-05T08:00:00.000Z',
    ankunft: '2026-08-05T09:00:00.000Z',
    counters: {},
    group: 'ffnd',
    deleted: false,
    createdAt: '',
    createdBy: 'u1',
    createdByName: 'Max Mustermann',
    updatedAt: '',
    updatedBy: 'u1',
    ...overrides,
  };
}

const noop = vi.fn();

describe('FahrtenbuchList', () => {
  it('zeigt beim Kilometerzähler Start, Ende und Differenz', () => {
    const kmVehicle = vehicle({
      id: 'v1',
      name: 'RLFA 2000',
      counters: VEHICLE_PRESETS.fahrzeug,
    });

    renderWithIntl(
      <FahrtenbuchList
        entries={[entry({ counters: { km: { start: 12340, end: 12362, diff: 22 } } })]}
        vehicles={[kmVehicle]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText(/12340 → 12362 km/)).toBeInTheDocument();
    expect(screen.getByText(/\(\+22 km\)/)).toBeInTheDocument();
    // Abgekürzt: „Kilometerstand" allein war breiter als die Fahrstrecke
    // daneben.
    expect(screen.getByText('km-Stand:')).toBeInTheDocument();
  });

  it('behält bei einem eigenen Zähler dessen Beschriftung', () => {
    // Nur Preset-Zähler haben eine Kurzform — ein selbst benannter Zähler wird
    // nicht geraten abgekürzt.
    const custom = vehicle({
      id: 'v1',
      name: 'Sonderfahrzeug',
      counters: [
        {
          id: 'seilwinde',
          label: 'Seilwinde Betriebsstunden',
          unit: 'h',
          mode: 'reading',
          changeWarning: 'anyChange',
          required: false,
        },
      ],
    });

    renderWithIntl(
      <FahrtenbuchList
        entries={[entry({ counters: { seilwinde: { end: 12 } } })]}
        vehicles={[custom]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText('Seilwinde Betriebsstunden:')).toBeInTheDocument();
  });

  it('beschriftet die Zähler eines Bootes', () => {
    // Der gemeldete Fall: In der Spalte stand nur „1 h · 2.1 h · 2.1 h".
    const boot = vehicle({
      id: 'v1',
      name: 'MZB',
      counters: VEHICLE_PRESETS.boot,
    });

    renderWithIntl(
      <FahrtenbuchList
        entries={[
          entry({
            counters: {
              betriebsstundenBb: { start: 1245, end: 1246, diff: 1 },
              lenzpumpeStb: { end: 2.1 },
              lenzpumpeBb: { end: 2.1 },
            },
          }),
        ]}
        vehicles={[boot]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText('Betriebsst. Bb:')).toBeInTheDocument();
    expect(screen.getByText('Lenzp. Stb:')).toBeInTheDocument();
    expect(screen.getByText('Lenzp. Bb:')).toBeInTheDocument();
  });

  it('zeigt die getankten Betriebsmittel in einer eigenen Spalte', () => {
    const kmVehicle = vehicle({
      id: 'v1',
      name: 'RLFA 2000',
      counters: VEHICLE_PRESETS.fahrzeug,
      fuelTypes: ['diesel', 'adblue'],
    });

    renderWithIntl(
      <FahrtenbuchList
        entries={[entry({ betriebsmittel: { diesel: 42, adblue: 5 } })]}
        vehicles={[kmVehicle]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Getankt' })).toBeInTheDocument();
    expect(screen.getByText('42 l')).toBeInTheDocument();
    expect(screen.getByText('5 l')).toBeInTheDocument();
  });

  it('zeigt bei leerem Ziel den Einsatznamen', () => {
    // Bei einer Einsatzfahrt darf das Ziel leer bleiben — der Einsatz benennt
    // es, und die Spalte bliebe sonst leer.
    renderWithIntl(
      <FahrtenbuchList
        entries={[entry({ ziel: '', firecallName: 'Brand B2 Hauptstraße' })]}
        vehicles={[vehicle({ id: 'v1', name: 'RLFA 2000' })]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByText('Brand B2 Hauptstraße')).toBeInTheDocument();
  });

  it('nennt den Mangel am Warnzeichen', () => {
    renderWithIntl(
      <FahrtenbuchList
        entries={[entry({ defekt: true, mangel: 'Bremse zieht nach links' })]}
        vehicles={[vehicle({ id: 'v1', name: 'RLFA 2000' })]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(
      screen.getByLabelText('Bremse zieht nach links'),
    ).toBeInTheDocument();
  });

  it('fällt am Warnzeichen auf den allgemeinen Vermerk zurück', () => {
    // Einträge aus der Zeit vor dem eigenen Mangelfeld haben nur das Häkchen.
    renderWithIntl(
      <FahrtenbuchList
        entries={[entry({ defekt: true })]}
        vehicles={[vehicle({ id: 'v1', name: 'RLFA 2000' })]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByLabelText('Defekt gemeldet')).toBeInTheDocument();
  });
});

describe('FahrtenbuchList — Filter', () => {
  const v1 = vehicle({ id: 'v1', name: 'RLFA 2000' });

  /**
   * Die Fahrstrecken der angezeigten Zeilen. Ohne Fahrzeugspalte
   * (`hideVehicleFilter`) ist das die vierte Zelle: Abfahrt, Fahrer, Zweck,
   * Fahrstrecke.
   */
  function shownTargets() {
    const rows = screen.queryAllByRole('row').slice(1);
    return rows.map((row) => within(row).getAllByRole('cell')[3].textContent);
  }

  const entries = [
    entry({
      id: 'a',
      driverName: 'Max Mustermann',
      ziel: 'Untere Hauptstraße 12',
      abfahrt: '2026-08-05T12:00:00.000Z',
      ankunft: '2026-08-05T13:00:00.000Z',
    }),
    entry({
      id: 'b',
      driverName: 'Erika Musterfrau',
      ziel: 'Seepark',
      hinweise: 'Schlauch getauscht',
      abfahrt: '2026-08-20T12:00:00.000Z',
      ankunft: '2026-08-20T13:00:00.000Z',
    }),
    entry({
      id: 'c',
      driverName: 'Max Mustermann',
      ziel: 'Bauhof',
      abfahrt: '2026-09-02T12:00:00.000Z',
      ankunft: '2026-09-02T13:00:00.000Z',
    }),
  ];

  function renderList() {
    renderWithIntl(
      <FahrtenbuchList
        entries={entries}
        vehicles={[v1]}
        hideVehicleFilter
        onEdit={noop}
        onDelete={noop}
      />,
    );
  }

  it('findet über die Fahrstrecke, auch ohne Umlaut', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText('Suche'), 'hauptstrasse');

    expect(shownTargets()).toEqual(['Untere Hauptstraße 12']);
  });

  it('findet über den Kommentar', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText('Suche'), 'schlauch');

    expect(shownTargets()).toEqual(['Seepark']);
  });

  it('grenzt auf den Zeitraum ein', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText('Von'), '2026-08-06');
    await user.type(screen.getByLabelText('Bis'), '2026-08-31');

    expect(shownTargets()).toEqual(['Seepark']);
  });

  it('zeigt nur die Fahrten des gewählten Fahrers', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText('Fahrer'));
    await user.click(
      within(screen.getByRole('listbox')).getByText('Max Mustermann'),
    );

    expect(shownTargets()).toEqual(['Untere Hauptstraße 12', 'Bauhof']);
  });

  it('liefert kombiniert die Schnittmenge', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByLabelText('Fahrer'));
    await user.click(
      within(screen.getByRole('listbox')).getByText('Max Mustermann'),
    );
    await user.type(screen.getByLabelText('Von'), '2026-09-01');

    expect(shownTargets()).toEqual(['Bauhof']);
  });

  it('meldet ein leeres Ergebnis und setzt den Filter zurück', async () => {
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText('Suche'), 'gibt es nicht');

    expect(screen.getByText('Keine Fahrt passt zum Filter.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));

    expect(shownTargets()).toHaveLength(3);
  });

  it('führt den Filter von außen, wenn er übergeben wird', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();

    renderWithIntl(
      <FahrtenbuchList
        entries={entries}
        vehicles={[v1]}
        hideVehicleFilter
        filter={{ ...EMPTY_FAHRTENBUCH_LIST_FILTER, search: 'seepark' }}
        onFilterChange={onFilterChange}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    expect(shownTargets()).toEqual(['Seepark']);

    await user.type(screen.getByLabelText('Von'), '2026-08-06');

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'seepark', from: '2026-08-06' }),
    );
  });
});

describe('FahrtenbuchList — Zusatzfahrer', () => {
  const rlfa = vehicle({ id: 'v1', name: 'RLFA 2000' });

  const renderWith = (overrides: Partial<FahrtenbuchEntry>) =>
    renderWithIntl(
      <FahrtenbuchList
        entries={[entry(overrides)]}
        vehicles={[rlfa]}
        onEdit={noop}
        onDelete={noop}
      />,
    );

  it('zeigt den Hauptfahrer und die Zahl der Zusatzfahrer', () => {
    renderWith({
      driverName: 'Max Mustermann',
      coDrivers: [{ name: 'Anna Bauer' }, { name: 'Eva Klein' }],
    });
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('nennt alle Fahrer als Beschriftung der Zelle', () => {
    renderWith({
      driverName: 'Max Mustermann',
      coDrivers: [{ name: 'Anna Bauer' }],
    });
    expect(
      screen.getByLabelText('Max Mustermann, Anna Bauer'),
    ).toBeInTheDocument();
  });

  it('zeigt ohne Zusatzfahrer keine Zahl', () => {
    renderWith({ driverName: 'Max Mustermann' });
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });
});
