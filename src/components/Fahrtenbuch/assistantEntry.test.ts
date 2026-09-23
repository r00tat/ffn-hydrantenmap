import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  describeAssistantEntry,
  planAssistantEntry,
  queryAssistantVehicles,
  type AssistantEntryContext,
} from './assistantEntry';
import { buildEntryDocument } from './entryLogic';

const NOW = '2026-09-22T12:00:00.000Z';

function vehicle(
  partial: Partial<FahrtenbuchVehicle> & { name: string },
): FahrtenbuchVehicle {
  return {
    id: partial.name,
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    createdAt: NOW,
    createdBy: 'u0',
    updatedAt: NOW,
    updatedBy: 'u0',
    ...partial,
  };
}

function person(
  partial: Partial<FahrtenbuchPerson> & { name: string },
): FahrtenbuchPerson {
  return {
    id: partial.name,
    active: true,
    createdAt: NOW,
    createdBy: 'u0',
    updatedAt: NOW,
    updatedBy: 'u0',
    ...partial,
  };
}

const rlfa = vehicle({
  id: 'v-rlfa',
  name: 'RLFA-A',
  lastCounters: { km: 1700 },
  lastEntryAt: '2026-09-20T18:30:00.000Z',
  lastDriverName: 'Erika Musterfrau',
});
const klf = vehicle({ id: 'v-klf', name: 'KLF', lastCounters: { km: 800 } });
const mzb = vehicle({
  id: 'v-mzb',
  name: 'MZB Neusiedl',
  counters: VEHICLE_PRESETS.boot,
  lastCounters: { betriebsstundenBb: 120, lenzpumpeStb: 40, lenzpumpeBb: 41 },
});

const max = person({ id: 'p-max', name: 'Max Mustermann', userIds: ['u-max'] });
const erika = person({ id: 'p-erika', name: 'Erika Musterfrau' });

function context(
  overrides: Partial<AssistantEntryContext> = {},
): AssistantEntryContext {
  return {
    vehicles: [rlfa, klf, mzb],
    persons: [max, erika],
    self: { userId: 'u-max', name: 'm.mustermann' },
    firecall: {
      id: 'fc-1',
      name: 'Brand Hauptstraße',
      date: '2026-09-22T10:00:00.000Z',
    },
    now: NOW,
    ...overrides,
  };
}

describe('planAssistantEntry', () => {
  it('baut aus „RLFA, Kilometerstand 1723, gefahren bin ich" einen Eintrag', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        fahrer: 'ich',
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.vehicle.id).toBe('v-rlfa');
    // Der Startstand kommt aus dem Zähler-Cache des Fahrzeugs: Gesprochen wird
    // der abgelesene Stand, nicht die Differenz.
    expect(plan.input.counters).toEqual({ km: { start: 1700, end: 1723 } });
    // „ich" ist der angemeldete Benutzer — und zwar über die gepflegte
    // Zuordnung Person→Benutzerkonto, nicht über den Anzeigenamen.
    expect(plan.input.driverId).toBe('p-max');
    expect(plan.input.driverName).toBe('Max Mustermann');
    expect(plan.input.zweck).toBe('einsatz');
    expect(plan.input.firecallId).toBe('fc-1');
  });

  it('trifft ein Fahrzeug auch über den Namensanfang', () => {
    // Gesprochen wird „RLFA", im Fahrtenbuch steht „RLFA-A".
    const plan = planAssistantEntry(
      { fahrzeug: 'RLFA', zaehlerstaende: [{ stand: 1723 }] },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.vehicle.id).toBe('v-rlfa');
  });

  it('fragt nach, wenn der Name auf mehrere Fahrzeuge passt', () => {
    const rlfaB = vehicle({ id: 'v-rlfa-b', name: 'RLFA-B' });
    const plan = planAssistantEntry(
      { fahrzeug: 'RLFA', zaehlerstaende: [{ stand: 1723 }] },
      context({ vehicles: [rlfa, rlfaB] }),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('vehicleAmbiguous');
    expect(plan.message).toContain('RLFA-A');
    expect(plan.message).toContain('RLFA-B');
  });

  it('nennt die vorhandenen Fahrzeuge, wenn keines passt', () => {
    const plan = planAssistantEntry(
      { fahrzeug: 'Drehleiter', zaehlerstaende: [{ stand: 1723 }] },
      context(),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('vehicleUnknown');
    // Ohne die Liste rät das Modell beim nächsten Versuch denselben Namen.
    expect(plan.message).toContain('RLFA-A');
    expect(plan.message).toContain('KLF');
  });

  it('ordnet einen benannten Zähler zu', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'MZB',
        zaehlerstaende: [
          { zaehler: 'Betriebsstunden Backbordmotor', stand: 123 },
          { zaehler: 'Lenzpumpe Steuerbord', stand: 40 },
          { zaehler: 'Lenzpumpe Backbord', stand: 41 },
        ],
        fahrer: 'Erika Musterfrau',
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.counters).toEqual({
      betriebsstundenBb: { start: 120, end: 123 },
      lenzpumpeStb: { end: 40 },
      lenzpumpeBb: { end: 41 },
    });
  });

  it('verlangt den Zählernamen, wenn das Fahrzeug mehrere hat', () => {
    const plan = planAssistantEntry(
      { fahrzeug: 'MZB', zaehlerstaende: [{ stand: 123 }] },
      context(),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('counterAmbiguous');
    expect(plan.message).toContain('Lenzpumpe Steuerbord');
  });

  it('meldet einen Zähler, den es am Fahrzeug nicht gibt', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'RLFA-A',
        zaehlerstaende: [{ zaehler: 'Betriebsstunden', stand: 12 }],
      },
      context(),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('counterUnknown');
    expect(plan.message).toContain('Kilometerstand');
  });

  it('verlangt den Abfahrtsstand, wenn es keine Vorfahrt gibt', () => {
    // Ohne `lastCounters` fehlt der Startwert — und damit die Differenz, die
    // den Nachweis ausmacht. Geraten wird nichts.
    const neu = vehicle({ id: 'v-neu', name: 'VF' });
    const plan = planAssistantEntry(
      { fahrzeug: 'VF', zaehlerstaende: [{ stand: 50 }] },
      context({ vehicles: [neu] }),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('invalid');
    expect(plan.message).toContain('Abfahrt');
  });

  it('nimmt den mitgesprochenen Abfahrtsstand entgegen', () => {
    const neu = vehicle({ id: 'v-neu', name: 'VF' });
    const plan = planAssistantEntry(
      { fahrzeug: 'VF', zaehlerstaende: [{ stand: 50, startStand: 30 }] },
      context({ vehicles: [neu] }),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.counters).toEqual({ km: { start: 30, end: 50 } });
  });

  it('lehnt einen Endstand unter dem Startstand ab', () => {
    const plan = planAssistantEntry(
      { fahrzeug: 'RLFA-A', zaehlerstaende: [{ stand: 1500 }] },
      context(),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('invalid');
    expect(plan.message).toContain('1700');
  });

  it('erkennt einen Fahrer aus der Personenliste', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'KLF',
        zaehlerstaende: [{ stand: 810 }],
        fahrer: 'Musterfrau Erika',
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // „Musterfrau Erika" und „Erika Musterfrau" sind dieselbe Person; gespeichert wird
    // die Schreibweise der Stammdaten.
    expect(plan.input.driverId).toBe('p-erika');
    expect(plan.input.driverName).toBe('Erika Musterfrau');
  });

  it('lässt einen unbekannten Fahrernamen als Freitext stehen', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'KLF',
        zaehlerstaende: [{ stand: 810 }],
        fahrer: 'Gast aus Weiden',
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.driverId).toBeUndefined();
    expect(plan.input.driverName).toBe('Gast aus Weiden');
  });

  it('fällt auf den Anzeigenamen zurück, wenn keine Person verknüpft ist', () => {
    const plan = planAssistantEntry(
      { fahrzeug: 'KLF', zaehlerstaende: [{ stand: 810 }], fahrer: 'ich' },
      context({ persons: [erika] }),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.driverId).toBeUndefined();
    expect(plan.input.driverName).toBe('m.mustermann');
  });

  it('übernimmt Mitfahrer und entdoppelt gegen den Fahrer', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'KLF',
        zaehlerstaende: [{ stand: 810 }],
        fahrer: 'ich',
        mitfahrer: ['Erika Musterfrau', 'Max Mustermann'],
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.coDrivers).toEqual([
      { id: 'p-erika', name: 'Erika Musterfrau' },
      { id: 'p-max', name: 'Max Mustermann' },
    ]);

    // Entdoppelt wird nicht hier, sondern beim Bau des Dokuments: Dort steht
    // die Regel schon, und zwar dieselbe für Dialog, Import und Sprachbefehl.
    // Sie hier zu wiederholen hieße, zwei Wahrheiten zu pflegen.
    const doc = buildEntryDocument(klf, plan.input, 'g1', {
      userId: 'u-max',
      userName: 'm.mustermann',
      now: NOW,
    });
    expect(doc.coDrivers).toEqual([{ id: 'p-erika', name: 'Erika Musterfrau' }]);
  });

  it('nimmt die Zeiten aus dem Einsatz', () => {
    const plan = planAssistantEntry(
      { fahrzeug: 'KLF', zaehlerstaende: [{ stand: 810 }] },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.abfahrt).toBe('2026-09-22T10:00:00.000Z');
    expect(Date.parse(plan.input.ankunft)).toBeGreaterThanOrEqual(
      Date.parse(plan.input.abfahrt),
    );
  });

  it('legt eine Uhrzeit ohne Datum auf den Einsatztag', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'KLF',
        zaehlerstaende: [{ stand: 810 }],
        abfahrt: '10:15',
        ankunft: '11:40',
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.abfahrt.slice(0, 10)).toBe('2026-09-22');
    expect(plan.input.ankunft.slice(0, 10)).toBe('2026-09-22');
    expect(Date.parse(plan.input.ankunft) - Date.parse(plan.input.abfahrt)).toBe(
      85 * 60 * 1000,
    );
  });

  it('verlangt ein Ziel, sobald die Fahrt nicht am Einsatz hängt', () => {
    const plan = planAssistantEntry(
      { fahrzeug: 'KLF', zaehlerstaende: [{ stand: 810 }], zweck: 'uebung' },
      context(),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('invalid');
    expect(plan.message).toContain('Ziel');
  });

  it('trägt eine Fahrt ohne Einsatzbezug mit Ziel ein', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'KLF',
        zaehlerstaende: [{ stand: 810 }],
        zweck: 'uebung',
        ziel: 'Übungsgelände Mönchhof',
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.zweck).toBe('uebung');
    expect(plan.input.ziel).toBe('Übungsgelände Mönchhof');
    // `buildEntryDocument` verwirft den Einsatzbezug bei jedem anderen Zweck —
    // er darf hier gar nicht erst mitkommen.
    expect(plan.input.firecallId).toBeUndefined();
  });

  it('nimmt eine getankte Menge entgegen', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        betriebsmittel: [{ art: 'Diesel', menge: 45 }],
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.betriebsmittel).toEqual({ diesel: 45 });
  });

  it('kennt die gesprochenen Namen der Betriebsmittel', () => {
    // „Öl" heißt in den Daten `oel`, und „Super" ist Benzin. Gesprochen wird
    // keins von beiden so, wie es gespeichert ist.
    const tank = vehicle({
      id: 'v-tank',
      name: 'TLFA',
      fuelTypes: ['diesel', 'adblue', 'oel'],
      lastCounters: { km: 400 },
    });
    const plan = planAssistantEntry(
      {
        fahrzeug: 'TLFA',
        zaehlerstaende: [{ stand: 430 }],
        betriebsmittel: [
          { art: 'AdBlue', menge: 10 },
          { art: 'Motoröl', menge: 1.5 },
        ],
      },
      context({ vehicles: [tank] }),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.betriebsmittel).toEqual({ adblue: 10, oel: 1.5 });
  });

  it('ordnet eine Menge ohne Art dem einzigen Kraftstoff zu', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        betriebsmittel: [{ menge: 45 }],
      },
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.betriebsmittel).toEqual({ diesel: 45 });
  });

  it('verlangt die Art, wenn das Fahrzeug mehrere führt', () => {
    const tank = vehicle({
      id: 'v-tank',
      name: 'TLFA',
      fuelTypes: ['diesel', 'adblue'],
      lastCounters: { km: 400 },
    });
    const plan = planAssistantEntry(
      {
        fahrzeug: 'TLFA',
        zaehlerstaende: [{ stand: 430 }],
        betriebsmittel: [{ menge: 45 }],
      },
      context({ vehicles: [tank] }),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('fuelAmbiguous');
    expect(plan.message).toContain('AdBlue');
  });

  it('lehnt ein Betriebsmittel ab, das das Fahrzeug nicht führt', () => {
    // Dieselbe Schranke wie im Dialog: Der bietet nur die Felder an, die am
    // Fahrzeug gepflegt sind. Ein Benzinkanister am Dieselfahrzeug ist eher
    // ein Hörfehler als eine Tankung.
    const plan = planAssistantEntry(
      {
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        betriebsmittel: [{ art: 'Benzin', menge: 20 }],
      },
      context(),
    );

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe('fuelUnknown');
    expect(plan.message).toContain('Diesel');
  });

  it('kommt ohne laufenden Einsatz aus', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'KLF',
        zaehlerstaende: [{ stand: 810 }],
        ziel: 'Werkstatt Eisenstadt',
      },
      context({ firecall: undefined }),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.zweck).toBe('sonstiges');
    expect(plan.input.ziel).toBe('Werkstatt Eisenstadt');
  });
});

describe('describeAssistantEntry', () => {
  it('fasst die Fahrt so zusammen, wie sie vorgelesen wird', () => {
    const plan = planAssistantEntry(
      {
        fahrzeug: 'RLFA',
        zaehlerstaende: [{ stand: 1723 }],
        fahrer: 'ich',
        betriebsmittel: [{ art: 'Diesel', menge: 45 }],
      },
      context(),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const summary = describeAssistantEntry(plan.vehicle, plan.input);

    expect(summary).toContain('RLFA-A');
    expect(summary).toContain('1723');
    expect(summary).toContain('Max Mustermann');
    expect(summary).toContain('45');
    expect(summary).toContain('Diesel');
    // Vorgelesen wird der Satz — kein Markdown, keine Aufzählung.
    expect(summary).not.toMatch(/[*#|]/);
  });
});

describe('queryAssistantVehicles', () => {
  it('nennt den letzten Kilometerstand eines Fahrzeugs', () => {
    const query = queryAssistantVehicles('RLFA', [rlfa, klf, mzb]);

    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query.vehicles).toEqual([rlfa]);
    expect(query.message).toContain('RLFA-A');
    expect(query.message).toContain('1700');
    // Der Stand allein sagt nicht, wie alt er ist — und ein Stand von vor
    // drei Fahrten ist kein Stand.
    expect(query.message).toContain('20.09.2026');
    expect(query.message).toContain('Erika Musterfrau');
  });

  it('nennt ohne Fahrzeugangabe alle Stände', () => {
    const query = queryAssistantVehicles(undefined, [rlfa, klf]);

    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query.vehicles).toHaveLength(2);
    expect(query.message).toContain('RLFA-A');
    expect(query.message).toContain('KLF');
  });

  it('nennt alle Zähler eines Fahrzeugs, das mehrere hat', () => {
    const query = queryAssistantVehicles('MZB', [mzb]);

    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query.message).toContain('Betriebsstunden Backbordmotor');
    expect(query.message).toContain('Lenzpumpe Steuerbord');
  });

  it('sagt es, wenn noch keine Fahrt erfasst ist', () => {
    const neu = vehicle({ id: 'v-neu', name: 'VF' });
    const query = queryAssistantVehicles('VF', [neu]);

    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query.message).toContain('keine');
  });

  it('antwortet auf einen mehrdeutigen Namen mit allen Treffern', () => {
    // Anders als beim Eintragen ist Mehrdeutigkeit hier kein Hindernis: Zwei
    // Stände zu nennen beantwortet die Frage, zwei Fahrten anzulegen nicht.
    const rlfaB = vehicle({ id: 'v-rlfa-b', name: 'RLFA-B', lastCounters: { km: 900 } });
    const query = queryAssistantVehicles('RLFA', [rlfa, rlfaB]);

    expect(query.ok).toBe(true);
    if (!query.ok) return;
    expect(query.vehicles).toHaveLength(2);
  });

  it('nennt die vorhandenen Fahrzeuge, wenn keines passt', () => {
    const query = queryAssistantVehicles('Drehleiter', [rlfa, klf]);

    expect(query.ok).toBe(false);
    if (query.ok) return;
    expect(query.error).toBe('vehicleUnknown');
    expect(query.message).toContain('KLF');
  });
});
