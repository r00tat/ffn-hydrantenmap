// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
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
});
