// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { EinsatzRow } from './einsatzRows';

// Die Default-Komponente derselben Datei lädt Firestore-Daten; für die reine
// Darstellung genügen Attrappen der Firebase- und Server-Action-Module. Die
// Rückgaben liegen in einem veränderbaren Objekt, damit der Test der
// Default-Komponente weiter unten echte Fahrzeuge und Mannschaft einspielen
// kann; die Voreinstellung ist überall leer.
const firestoreData = vi.hoisted(() => ({
  groups: [] as string[],
  activeVehicles: [] as unknown[],
  fzgItems: [] as unknown[],
  crew: [] as unknown[],
}));

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
    skippedVehicleIds: [],
    failedVehicleIds: [],
  }),
  createFahrtenbuchEntry: vi.fn(),
  updateFahrtenbuchEntry: vi.fn(),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ groups: firestoreData.groups }),
}));
vi.mock('../../hooks/useFirebaseCollection', () => ({
  // Die Komponente liest zwei Unterkollektionen des Einsatzes; unterschieden
  // wird am letzten Pfadsegment.
  default: ({ pathSegments }: { pathSegments?: string[] }) =>
    pathSegments?.[1] === 'crew' ? firestoreData.crew : firestoreData.fzgItems,
}));
vi.mock('../../hooks/useFahrtenbuchVehicles', () => ({
  default: () => ({
    vehicles: firestoreData.activeVehicles,
    activeVehicles: firestoreData.activeVehicles,
    vehiclesById: new Map(),
  }),
}));
vi.mock('../../hooks/useFahrtenbuchPersons', () => ({
  default: () => ({ persons: [], activePersons: [] }),
}));
vi.mock('../../hooks/useFahrtenbuchEntries', () => ({ default: () => [] }));
vi.mock('../../hooks/useFahrtenbuchGroupStandort', () => ({
  default: () => ({
    standort: { lat: 47.9482913, lng: 16.848222 },
    configured: false,
  }),
}));

import type { Firecall } from '../firebase/firestore';
import EinsatzFahrtenbuch, {
  EinsatzFahrtenbuchView,
} from './EinsatzFahrtenbuch';
import { createFahrtenbuchEntries } from './fahrtenbuchActions';

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
  persons: [],
  times: {
    abfahrt: '2026-08-03T10:00:00.000Z',
    ankunft: '2026-08-03T12:00:00.000Z',
  },
  isMember: true,
  saving: false,
  onSave: vi.fn(),
  onChangeTimes: vi.fn(),
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

  it('zeigt den vorbelegten Fahrer in der Zeile', () => {
    renderWithIntl(<EinsatzFahrtenbuchView {...baseProps} rows={[row()]} />);
    expect(screen.getByDisplayValue('Max Mustermann')).toBeInTheDocument();
  });

  it('hält die Zählerfelder eingeklappt, bis Details geöffnet werden', async () => {
    // Der Sinn des Umbaus: Im Normalfall ist an einer Zeile nichts zu tun. Die
    // Zählerfelder standen vorher immer offen und machten aus fünf Fahrzeugen
    // eine Wand aus Eingabefeldern.
    const user = userEvent.setup();
    renderWithIntl(<EinsatzFahrtenbuchView {...baseProps} rows={[row()]} />);
    expect(screen.queryByDisplayValue('1000')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details bearbeiten' }));
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
  });

  it('zeigt die Kilometer-Vorschau als Schätzung in der Zeile', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row()]}
        autoFill={{ distance: { roundTripKm: 24, source: 'estimate' } }}
      />,
    );
    // „ca.“ muss dran: Im Fahrtenbuch darf eine Schätzung nicht wie eine
    // Ablesung aussehen.
    expect(screen.getByText('1000 → ca. 1024 km (ca. +24)')).toBeInTheDocument();
  });

  it('meldet eine Zeile ohne Startstand, statt eine Zahl zu erfinden', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row({ counters: {} })]}
        autoFill={{ distance: { roundTripKm: 24, source: 'estimate' } }}
      />,
    );
    expect(
      screen.getByText('kein Startstand — wird ohne Kilometer gespeichert'),
    ).toBeInTheDocument();
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

  it('zeigt an einer bereits erfassten Zeile keine Eingabefelder', () => {
    // Gesperrte Felder waren vorher nötig, weil die Karte alle Felder zeigte.
    // Die kompakte Zeile lässt sie ganz weg: Wer den Eintrag ändern will, nimmt
    // den Bearbeiten-Knopf und damit den vollen Dialog.
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row({ existingEntry: { id: 'e1' } as FahrtenbuchEntry })]}
      />,
    );
    expect(screen.getByText('Bereits erfasst')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Max Mustermann')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Details bearbeiten' }),
    ).not.toBeInTheDocument();
  });

  it('fragt beim Boot Betriebsstunden statt Kilometer ab', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: 'Details bearbeiten' }));
    expect(
      screen.getByLabelText(/Betriebsstunden Backbordmotor — Ende/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Kilometerstand/)).not.toBeInTheDocument();
  });

  it('zeigt Einheiten ohne Fahrzeug in den Stammdaten als Hinweis statt als Zeile', () => {
    // Der gemeldete Fall: WLA-Bergung stand als Zeile in der Liste, obwohl für
    // sie kein Fahrtenbucheintrag nötig ist. Sie bekommt keine Zeile mehr — der
    // Hinweis hält aber fest, dass für sie bewusst nichts erfasst wird, damit
    // ein Fahrzeug, das in den Stammdaten versehentlich fehlt, auffällt.
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row()]}
        unitsWithoutVehicle={['WLA-Bergung', 'WLA-Logistik']}
      />,
    );

    expect(
      screen.getByText(/Nicht im Fahrtenbuch hinterlegt/),
    ).toHaveTextContent('WLA-Bergung, WLA-Logistik');
    // Keine Zeile und damit auch kein Zuordnungsfeld für sie.
    expect(
      screen.queryByRole('combobox', { name: 'Fahrzeug zuordnen' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt den Hinweis auch, wenn gar keine Zeile übrig bleibt', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[]}
        unitsWithoutVehicle={['WLA-Bergung']}
      />,
    );

    expect(screen.getByText(/keine Fahrzeuge zugeordnet/)).toBeInTheDocument();
    expect(screen.getByText(/WLA-Bergung/)).toBeInTheDocument();
  });

  it('zeigt keinen Hinweis, wenn jede Einheit ein Fahrzeug hat', () => {
    renderWithIntl(<EinsatzFahrtenbuchView {...baseProps} rows={[row()]} />);
    expect(
      screen.queryByText(/Nicht im Fahrtenbuch hinterlegt/),
    ).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Details bearbeiten' }));
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

  it('zeigt für eine Einheit ohne Zähler weder Fahrer noch Kilometer', () => {
    // WLA-Bergung, WLA-Logistik und Anhänger werden aufgenommen bzw. gezogen —
    // die Mannschaftszuordnung kennt für sie keinen Maschinisten, und eine
    // eigene Wegstrecke haben sie auch nicht.
    const wla: FahrtenbuchVehicle = {
      ...vehicle,
      id: 'gv3',
      name: 'WLA-Bergung',
      counters: VEHICLE_PRESETS.none,
      lastCounters: {},
    };
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        vehicles={[vehicle, wla]}
        rows={[
          row({
            vehicleId: 'gv3',
            vehicleName: 'WLA-Bergung',
            sourceName: 'WLA-Bergung',
            driverId: undefined,
            driverName: '',
            counters: {},
          }),
        ]}
        autoFill={{ distance: { roundTripKm: 24, source: 'estimate' } }}
      />,
    );

    expect(screen.queryByLabelText('Fahrer')).not.toBeInTheDocument();
    expect(screen.queryByText(/km/)).not.toBeInTheDocument();
  });

  it('zeigt bei einem Fahrzeug mit Zähler weiterhin das Fahrerfeld', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView {...baseProps} rows={[row()]} />,
    );
    expect(screen.getByLabelText('Fahrer')).toBeInTheDocument();
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
      screen.queryByLabelText(/Kilometerstand — Ende/),
    ).not.toBeInTheDocument();
  });

  it('sperrt den Speichern-Button während des Speicherns', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView {...baseProps} rows={[row()]} saving />,
    );
    expect(screen.getByRole('button', { name: 'Alle speichern' })).toBeDisabled();
  });
});

describe('EinsatzFahrtenbuchView — Kilometer-Hinweis', () => {
  it('reicht die Schätzung an die Zählerfelder durch', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row()]}
        autoFill={{ distance: { roundTripKm: 24, source: 'estimate' } }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Details bearbeiten' }));
    expect(
      screen.getByText('ca. 24 km, wird beim Speichern berechnet'),
    ).toBeInTheDocument();
  });

  it('setzt die Zeiten des Kopfblocks, nicht je Fahrzeug', async () => {
    const user = userEvent.setup();
    const onChangeTimes = vi.fn();
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        rows={[row(), row({ key: 'i2' })]}
        onChangeTimes={onChangeTimes}
      />,
    );
    // Genau ein Paar Zeitfelder für beide Fahrzeuge.
    expect(screen.getAllByLabelText('Abfahrt')).toHaveLength(1);

    await user.clear(screen.getByLabelText('Abfahrt'));
    await user.type(screen.getByLabelText('Abfahrt'), '2026-08-03T11:30');
    expect(onChangeTimes).toHaveBeenCalled();
  });
});

describe('EinsatzFahrtenbuch — Sammelerfassung ohne Endstand', () => {
  const firecall = {
    id: 'f1',
    name: 'Brand',
    group: 'ffnd',
    date: '2026-08-03T10:00:00.000Z',
    abruecken: '2026-08-03T12:00:00.000Z',
    // Einsatzort im Nachbarort — daraus entsteht die Luftlinien-Schätzung.
    lat: 47.98,
    lng: 16.9,
  } as unknown as Firecall;

  beforeEach(() => {
    firestoreData.groups = ['ffnd'];
    firestoreData.activeVehicles = [vehicle];
    firestoreData.fzgItems = [{ id: 'i1', name: 'RLFA 3000/100' }];
    firestoreData.crew = [
      { name: 'Max Mustermann', vehicleId: 'i1', funktion: 'Maschinist' },
    ];
    vi.mocked(createFahrtenbuchEntries).mockResolvedValue({
      success: true,
      created: 1,
      skippedVehicleIds: [],
      failedVehicleIds: [],
      roundTripKm: 20,
    });
  });

  afterEach(() => {
    firestoreData.groups = [];
    firestoreData.activeVehicles = [];
    firestoreData.fzgItems = [];
    firestoreData.crew = [];
  });

  it('speichert die Zeile ohne Endstand und schickt ihn nicht mit', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <EinsatzFahrtenbuch firecallId="f1" firecall={firecall} />,
    );

    await user.click(screen.getByRole('button', { name: 'Alle speichern' }));

    await waitFor(() => expect(createFahrtenbuchEntries).toHaveBeenCalled());
    const [, entries] = vi.mocked(createFahrtenbuchEntries).mock.calls[0];
    // Kern der Vorprüfung: Der Client hält die Zeile für speicherbar, überlässt
    // den Endstand aber dem Server — seine Schätzung darf nicht als Ablesung im
    // Fahrtenbuch landen.
    expect(entries).toHaveLength(1);
    expect(entries[0].counters.km).toEqual({ start: 1000 });
  });

  it('nennt die tatsächlich eingetragene Strecke in der Erfolgsmeldung', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <EinsatzFahrtenbuch firecallId="f1" firecall={firecall} />,
    );

    await user.click(screen.getByRole('button', { name: 'Alle speichern' }));

    expect(
      await screen.findByText('1 Fahrt gespeichert — 20 km je Fahrzeug'),
    ).toBeInTheDocument();
  });

  it('meldet eine nicht schreibbare Zeile als fehlend und nicht als schon erfasst', async () => {
    vi.mocked(createFahrtenbuchEntries).mockResolvedValue({
      success: true,
      created: 0,
      skippedVehicleIds: [],
      failedVehicleIds: ['gv1'],
    });
    const user = userEvent.setup();
    renderWithIntl(<EinsatzFahrtenbuch firecallId="f1" firecall={firecall} />);

    await user.click(screen.getByRole('button', { name: 'Alle speichern' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('konnte nicht gespeichert werden');
    expect(alert).toHaveTextContent('von Hand nachgetragen');
    // Der Kern des Befunds: Die Fahrt fehlt — sie darf nicht als bereits
    // gebucht gemeldet werden.
    expect(alert).not.toHaveTextContent('schon erfasst');
  });

  it('meldet ein inzwischen erfasstes Fahrzeug weiterhin als Duplikat', async () => {
    vi.mocked(createFahrtenbuchEntries).mockResolvedValue({
      success: true,
      created: 0,
      skippedVehicleIds: ['gv1'],
      failedVehicleIds: [],
    });
    const user = userEvent.setup();
    renderWithIntl(<EinsatzFahrtenbuch firecallId="f1" firecall={firecall} />);

    await user.click(screen.getByRole('button', { name: 'Alle speichern' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('schon erfasst');
    expect(alert).not.toHaveTextContent('konnte nicht gespeichert werden');
  });
});

describe('EinsatzFahrtenbuchView — Zusatzfahrer', () => {
  const persons = [{ id: 'p2', name: 'Anna Bauer' }];

  it('zeigt ein Zusatzfahrer-Feld für ein Fahrzeug mit Fahrer', () => {
    renderWithIntl(
      <EinsatzFahrtenbuchView {...baseProps} persons={persons} rows={[row()]} />,
    );
    expect(screen.getByLabelText('Zusatzfahrer')).toBeInTheDocument();
  });

  it('meldet eine Auswahl über onChangeRow', async () => {
    const user = userEvent.setup();
    const onChangeRow = vi.fn();
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        persons={persons}
        rows={[row()]}
        onChangeRow={onChangeRow}
      />,
    );

    await user.click(screen.getByLabelText('Zusatzfahrer'));
    await user.click(await screen.findByRole('option', { name: 'Anna Bauer' }));

    expect(onChangeRow).toHaveBeenCalledWith('i1', {
      coDrivers: [{ id: 'p2', name: 'Anna Bauer' }],
    });
  });

  it('zeigt bei einer Einheit ohne Zähler kein Zusatzfahrer-Feld', () => {
    const trailer: FahrtenbuchVehicle = {
      ...vehicle,
      id: 'gv9',
      name: 'Anhänger',
      counters: [],
    };
    renderWithIntl(
      <EinsatzFahrtenbuchView
        {...baseProps}
        persons={persons}
        vehicles={[trailer]}
        rows={[row({ vehicleId: 'gv9', vehicleName: 'Anhänger' })]}
      />,
    );
    expect(screen.queryByLabelText('Zusatzfahrer')).not.toBeInTheDocument();
  });
});
