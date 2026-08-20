// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';
import FahrtenbuchVehicleCard from './FahrtenbuchVehicleCard';

function vehicle(
  overrides: Partial<FahrtenbuchVehicle> = {},
): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    kennzeichen: 'ND-12345',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    lastCounters: { km: 1042 },
    lastEntryAt: '2026-08-01T10:00:00.000Z',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

describe('FahrtenbuchVehicleCard', () => {
  it('zeigt Name, Kennzeichen und aktuellen Zählerstand', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('RLFA 2000')).toBeInTheDocument();
    expect(screen.getByText('ND-12345')).toBeInTheDocument();
    expect(screen.getByText(/1042 km/)).toBeInTheDocument();
  });

  it('zeigt die Zähler eines Boots statt Kilometern', () => {
    const boot = vehicle({
      name: 'MZB',
      kennzeichen: undefined,
      counters: VEHICLE_PRESETS.boot,
      lastCounters: { betriebsstundenBb: 120, lenzpumpeStb: 39, lenzpumpeBb: 39 },
    });
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={boot}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText(/120 h/)).toBeInTheDocument();
    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });

  it('zeigt keine Zähler für ein Fahrzeug ohne Zählerdefinitionen', () => {
    // Der veraltete `km`-Eintrag im Cache ist realistisch: ein Fahrzeug, das von
    // der Vorlage `fahrzeug` auf `none` umgestellt wurde, behält ihn. Er darf
    // nicht angezeigt werden — maßgeblich sind allein die Definitionen.
    const anhaenger = vehicle({
      name: 'WLA Wasser',
      counters: VEHICLE_PRESETS.none,
      lastCounters: { km: 500 },
      fuelTypes: [],
    });
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={anhaenger}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('WLA Wasser')).toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });

  it('verlinkt auf die Fahrzeug-Ansicht', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/fahrtenbuch/ffnd/v1',
    );
  });

  it('zeigt die letzte Fahrt mit Fahrer', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        lastDriverName="Max Mustermann"
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText(/Max Mustermann/)).toBeInTheDocument();
    expect(screen.getByText(/Letzte Fahrt/)).toBeInTheDocument();
  });

  it('ruft onAddTrip mit der Fahrzeug-ID auf', async () => {
    const onAddTrip = vi.fn();
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        onAddTrip={onAddTrip}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Fahrt eintragen' }),
    );
    expect(onAddTrip).toHaveBeenCalledWith('v1');
  });

  it('zeigt den Defekt-Hinweis, wenn die letzte Fahrt einen Mangel meldet', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        lastEntryHasDefect
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('Defekt gemeldet')).toBeInTheDocument();
  });

  it('zeigt den Defekt-Hinweis aus dem Fahrzeug-Cache ohne geladene Einträge', () => {
    // Der Fall, der vorher stillschweigend durchgefallen ist: die letzte Fahrt
    // liegt außerhalb des geladenen Eintragsfensters, es gibt also keinen
    // abgeleiteten Wert — der Cache am Fahrzeug muss reichen.
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({
          lastEntryAt: '2026-03-12T09:15:00.000Z',
          lastEntryHasDefect: true,
          lastDriverName: 'Erika Musterfrau',
        })}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('Defekt gemeldet')).toBeInTheDocument();
    expect(screen.getByText(/Erika Musterfrau/)).toBeInTheDocument();
  });

  it('lässt ein gecachtes false nicht auf die Ableitung zurückfallen', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({ lastEntryHasDefect: false })}
        lastEntryHasDefect
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
  });

  it('zeigt keinen Defekt-Hinweis ohne Mangel', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
  });

  it('zeigt die Anzahl offener Mängel aus dem Fahrzeug-Cache', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({ openMangelCount: 2 })}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('2 offene Mängel')).toBeInTheDocument();
  });

  it('verlinkt den Mängel-Chip auf die gefilterte Mängelliste', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({ openMangelCount: 1 })}
        onAddTrip={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('link', { name: /1 offener Mangel/ }),
    ).toHaveAttribute('href', '/fahrtenbuch/maengel?vehicle=v1');
  });

  it('fällt auf die geladenen Mängel zurück, solange der Cache fehlt', () => {
    // Ein Fahrzeug aus der Zeit vor `openMangelCount` — `undefined` heißt dort
    // „nie geschrieben" und darf nicht als „keine Mängel" durchgehen.
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle()}
        openMangelCount={3}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('3 offene Mängel')).toBeInTheDocument();
  });

  it('lässt ein gecachtes 0 nicht auf die Ableitung zurückfallen', () => {
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({ openMangelCount: 0 })}
        openMangelCount={3}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.queryByText(/offene Mängel/)).not.toBeInTheDocument();
  });

  it('schweigt, wenn der Mangel zur letzten Fahrt behoben ist', () => {
    // #706: Vorher kam „Defekt gemeldet" genau dann zum Vorschein, wenn der
    // letzte Mangel behoben wurde — der Zähler hatte den Hinweis bis dahin
    // bloß verdeckt.
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({
          lastEntryHasDefect: true,
          openMangelCount: 0,
          lastEntryMangelId: 'm1',
        })}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
    expect(screen.queryByText(/offene[rn]? Mangel|offene Mängel/)).not.toBeInTheDocument();
  });

  it('zeigt den Hinweis für eine Defektfahrt ohne Mangeldatensatz', () => {
    // Der Altbestand aus der Zeit vor der Mängelverwaltung — dafür gibt es den
    // Hinweis.
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({
          lastEntryHasDefect: true,
          openMangelCount: 0,
          lastEntryMangelId: null,
        })}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('Defekt gemeldet')).toBeInTheDocument();
  });

  it('fällt auf die geladenen Mängel zurück, solange der Cache das Feld nicht kennt', () => {
    // Ein Fahrzeug, dessen Cache vor `lastEntryMangelId` geschrieben wurde:
    // Ohne den Rückfall bliebe der Hinweis bis zur nächsten Mutation stehen.
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({ lastEntryHasDefect: true, openMangelCount: 0 })}
        lastEntryHasMangel
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
  });

  it('ersetzt den Defekt-Hinweis, sobald es offene Mängel gibt', () => {
    // Beide gleichzeitig wären doppelt gemoppelt: Der Zähler sagt alles, was
    // „Defekt gemeldet" sagt, und zusätzlich wie viel offen ist.
    renderWithIntl(
      <FahrtenbuchVehicleCard
        groupId="ffnd"
        vehicle={vehicle({ lastEntryHasDefect: true, openMangelCount: 1 })}
        onAddTrip={vi.fn()}
      />,
    );
    expect(screen.getByText('1 offener Mangel')).toBeInTheDocument();
    expect(screen.queryByText('Defekt gemeldet')).not.toBeInTheDocument();
  });
});
