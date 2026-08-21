// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { IntlWrapper } from '../../test-utils/intlRender';
import type { FahrtenbuchEntryInput } from './entryLogic';
import {
  defaultFirecallOption,
  useEntryFormState,
  type EntryFormVehicle,
  type FahrtenbuchFirecallOption,
  type UseEntryFormStateOptions,
} from './useEntryFormState';

const vehicles: EntryFormVehicle[] = [
  // Ohne Zähler — für `requiresDriver` ein Anhänger bzw. Wechselladeaufbau, der
  // keinen Fahrer braucht.
  { id: 'v1', name: 'WLA-Bergung', counters: [], fuelTypes: [] },
  // Mit Zähler, damit die Fahrerpflicht greift. Der Zähler ist bewusst nicht
  // `required`, damit die Fahrerprüfung nicht hinter einem fehlenden Stand
  // verschwindet.
  {
    id: 'v2',
    name: 'TLF',
    counters: [
      {
        id: 'km',
        label: 'Kilometerstand',
        unit: 'km',
        mode: 'startEnd',
        changeWarning: 'decrease',
        required: false,
      },
    ],
    fuelTypes: [],
  },
];

const firecalls: FahrtenbuchFirecallOption[] = [
  {
    id: 'f1',
    name: 'Brand Hauptstraße',
    date: '2026-03-10T18:00:00.000Z',
    abruecken: '2026-03-10T20:30:00.000Z',
  },
];

/** ISO-Zeitstempel aus lokalen Komponenten — sonst hängt der Test an der TZ. */
function localIso(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): string {
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** Ein bestehender Eintrag mit festen Zeiten als Ausgangslage. */
function existingEntry(abfahrt: string, ankunft: string): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'TLF',
    driverName: 'Max',
    zweck: 'sonstiges',
    ziel: '',
    abfahrt,
    ankunft,
    counters: {},
    group: 'g1',
    deleted: false,
    createdAt: abfahrt,
    createdBy: 'u1',
    createdByName: 'Max',
    updatedAt: abfahrt,
    updatedBy: 'u1',
  };
}

/**
 * `firecalls: []` ist der Weg, die Vorbelegung abzuschalten: Ohne Einsätze in
 * der Liste gibt es nichts vorzubelegen, die Auswahl bleibt aber vorhanden
 * (anders als `firecalls: undefined`, das Gastformular).
 */
function renderForm(options: Partial<UseEntryFormStateOptions> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ success: true });
  const { result, rerender } = renderHook(
    (props: Partial<UseEntryFormStateOptions>) =>
      useEntryFormState({
        vehicles,
        firecalls,
        vehicleId: 'v1',
        onSubmit,
        ...options,
        ...props,
      }),
    { wrapper: IntlWrapper, initialProps: {} },
  );
  return { result, onSubmit, rerender };
}

/** Der zuletzt an `onSubmit` übergebene Eintrag. */
function submitted(onSubmit: ReturnType<typeof vi.fn>): FahrtenbuchEntryInput {
  return onSubmit.mock.calls.at(-1)![0] as FahrtenbuchEntryInput;
}

describe('defaultFirecallOption', () => {
  const list: FahrtenbuchFirecallOption[] = [
    { id: 'f2', name: 'Neuester' },
    { id: 'f1', name: 'Älterer' },
  ];

  it('nimmt den aktiven Einsatz', () => {
    expect(defaultFirecallOption(list, 'f1')?.id).toBe('f1');
  });

  it('nimmt ohne aktiven Einsatz den neuesten', () => {
    // Die Liste kommt absteigend nach Datum.
    expect(defaultFirecallOption(list, undefined)?.id).toBe('f2');
  });

  it('nimmt den neuesten, wenn der aktive Einsatz einer anderen Gruppe gehört', () => {
    // Der aktive Einsatz kommt aus der App-weiten Auswahl, die Liste aus der
    // Gruppe des Fahrtenbuchs — beides muss nicht zusammenpassen.
    expect(defaultFirecallOption(list, 'fremd')?.id).toBe('f2');
  });

  it('ergibt ohne Liste nichts', () => {
    expect(defaultFirecallOption([], 'f1')).toBeUndefined();
    expect(defaultFirecallOption(undefined, 'f1')).toBeUndefined();
  });
});

describe('useEntryFormState', () => {
  describe('changeAbfahrt', () => {
    it('zieht das Datum der Ankunft mit und behält deren Uhrzeit', () => {
      const { result } = renderForm({
        entry: existingEntry(
          localIso(2026, 3, 10, 8, 0),
          localIso(2026, 3, 10, 10, 30),
        ),
      });

      act(() => result.current.changeAbfahrt(localIso(2026, 3, 12, 9, 0)));

      const ankunft = new Date(result.current.ankunft);
      expect(ankunft.getFullYear()).toBe(2026);
      expect(ankunft.getMonth()).toBe(2);
      expect(ankunft.getDate()).toBe(12);
      // Die Uhrzeit bleibt, nur der Tag wandert mit.
      expect(ankunft.getHours()).toBe(10);
      expect(ankunft.getMinutes()).toBe(30);
    });

    it('lässt die Ankunft nicht vor die Abfahrt rutschen', () => {
      const { result } = renderForm({
        entry: existingEntry(
          localIso(2026, 3, 10, 8, 0),
          localIso(2026, 3, 10, 9, 0),
        ),
      });

      // Abfahrt nach der bisherigen Ankunftszeit — die Ankunft folgt auf die
      // Abfahrt statt am selben Tag davor zu liegen.
      act(() => result.current.changeAbfahrt(localIso(2026, 3, 10, 22, 0)));

      expect(
        new Date(result.current.ankunft).getTime(),
      ).toBeGreaterThanOrEqual(new Date(result.current.abfahrt).getTime());
    });
  });

  describe('changeFirecall', () => {
    it('übernimmt Alarmierung und Abrücken als Zeitvorschlag', () => {
      const { result } = renderForm();

      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));

      expect(result.current.firecallId).toBe('f1');
      expect(result.current.abfahrt).toBe('2026-03-10T18:00:00.000Z');
      expect(result.current.ankunft).toBe('2026-03-10T20:30:00.000Z');
    });

    it('setzt die Auswahl bei leerem Wert auf undefined zurück', () => {
      const { result } = renderForm();

      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      act(() => result.current.changeFirecall(undefined, ''));

      expect(result.current.firecallId).toBeUndefined();
    });
  });

  describe('Einsatz als Regelfall', () => {
    it('setzt den Zweck auf einsatz, sobald ein Einsatz verknüpft wird', () => {
      // Sonst verwirft `submit` die Verknüpfung stillschweigend — und eine
      // Fahrt ohne Einsatzbezug findet keine Duplikatserkennung je wieder.
      const { result } = renderForm({ firecalls: [] });

      expect(result.current.zweck).toBe('sonstiges');
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));

      expect(result.current.zweck).toBe('einsatz');
    });

    it('lässt den Zweck bei einem nur eingetippten Namen unberührt', () => {
      const { result } = renderForm({ firecalls: [] });

      act(() => result.current.changeFirecall(undefined, 'Brand irgendwo'));

      expect(result.current.zweck).toBe('sonstiges');
    });

    it('räumt die Verknüpfung, wenn der Zweck wechselt', () => {
      // Was im Feld steht, muss dem entsprechen, was gespeichert wird.
      const { result } = renderForm();

      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      act(() => result.current.changeZweck('uebung'));

      expect(result.current.firecallId).toBeUndefined();
      expect(result.current.firecallName).toBe('');
    });

    it('meldet einen Zweck einsatz ohne Verknüpfung', () => {
      const { result } = renderForm({ firecalls: [] });

      act(() => result.current.changeZweck('einsatz'));
      expect(result.current.firecallLinkMissing).toBe(true);

      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      expect(result.current.firecallLinkMissing).toBe(false);
    });
  });

  describe('Vorbelegung mit dem aktiven Einsatz', () => {
    it('wählt den aktiven Einsatz und setzt den Zweck', async () => {
      // Damit muss niemand mehr Zweck, Einsatz und Fahrstrecke von Hand
      // angeben — der Regelfall ist die Fahrt zum laufenden Einsatz.
      const { result } = renderForm({ activeFirecallId: 'f1' });

      await waitFor(() => expect(result.current.firecallId).toBe('f1'));
      expect(result.current.zweck).toBe('einsatz');
      expect(result.current.firecallName).toBe('Brand Hauptstraße');
      // Das Ziel ist damit abgedeckt und kein Pflichtfeld mehr.
      expect(result.current.zielCoveredByFirecall).toBe(true);
    });

    it('übernimmt die Zeiten des Einsatzes', async () => {
      const { result } = renderForm({ activeFirecallId: 'f1' });

      await waitFor(() =>
        expect(result.current.abfahrt).toBe('2026-03-10T18:00:00.000Z'),
      );
      expect(result.current.ankunft).toBe('2026-03-10T20:30:00.000Z');
    });

    it('greift auch, wenn die Einsatzliste erst nachgeladen wird', async () => {
      // `useFahrtenbuchFirecalls` ist ein Snapshot: beim ersten Rendern leer.
      const { result, rerender } = renderForm({ firecalls: [] });

      expect(result.current.firecallId).toBeUndefined();
      rerender({ firecalls });

      await waitFor(() => expect(result.current.firecallId).toBe('f1'));
    });

    it('lässt einen bestehenden Eintrag unberührt', () => {
      const { result } = renderForm({
        activeFirecallId: 'f1',
        entry: existingEntry(
          localIso(2026, 3, 1, 8, 0),
          localIso(2026, 3, 1, 9, 0),
        ),
      });

      expect(result.current.firecallId).toBeUndefined();
      expect(result.current.zweck).toBe('sonstiges');
    });

    it('überschreibt eine vom Benutzer geräumte Auswahl nicht wieder', async () => {
      const { result } = renderForm({ activeFirecallId: 'f1' });

      await waitFor(() => expect(result.current.firecallId).toBe('f1'));
      act(() => result.current.changeZweck('uebung'));

      expect(result.current.firecallId).toBeUndefined();
      expect(result.current.zweck).toBe('uebung');
    });

    it('belegt ohne Einsatzliste nichts vor (Gastformular)', () => {
      const { result } = renderForm({ firecalls: undefined });

      expect(result.current.firecallId).toBeUndefined();
      expect(result.current.zweck).toBe('sonstiges');
    });
  });

  describe('Duplikat und Überschneidung', () => {
    /** Eine bereits erfasste Fahrt desselben Fahrzeugs zu Einsatz f1. */
    const booked: FahrtenbuchEntry = {
      ...existingEntry('2026-03-10T18:00:00.000Z', '2026-03-10T20:30:00.000Z'),
      id: 'e9',
      vehicleId: 'v1',
      zweck: 'einsatz',
      firecallId: 'f1',
      firecallName: 'Brand Hauptstraße',
      driverName: 'Anna Bauer',
    };

    it('meldet eine schon erfasste Fahrt und speichert nicht', async () => {
      const { result, onSubmit } = renderForm({ entries: [booked] });

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));

      expect(result.current.duplicateEntry?.id).toBe('e9');

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(result.current.errors).toContain('duplicateFirecallEntry');
    });

    it('speichert nach Bestätigung und sagt es dem Server', async () => {
      const { result, onSubmit } = renderForm({ entries: [booked] });

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      act(() => result.current.setDuplicateConfirmed(true));

      expect(result.current.duplicateConfirmed).toBe(true);

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][1]).toEqual({ confirmDuplicate: true });
    });

    it('nimmt die Bestätigung zurück, wenn die Auswahl wechselt', () => {
      // Bestätigt wurde diese eine Fahrt, nicht das Formular.
      const { result } = renderForm({ entries: [booked] });

      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      act(() => result.current.setDuplicateConfirmed(true));
      act(() => result.current.changeFirecall(undefined, ''));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));

      expect(result.current.duplicateConfirmed).toBe(false);
    });

    it('meldet die bearbeitete Fahrt nicht als ihr eigenes Duplikat', () => {
      const { result } = renderForm({ entries: [booked], entry: booked });

      expect(result.current.duplicateEntry).toBeUndefined();
    });

    it('warnt bei überschneidenden Zeiten desselben Fahrzeugs', () => {
      // Ohne Einsatzliste, damit die Fahrt nicht schon als Duplikat gilt — dann
      // stünde sie nur im Duplikatshinweis.
      const { result } = renderForm({ entries: [booked], firecalls: [] });

      // Mitten in den Zeitraum der bestehenden Fahrt hinein.
      act(() => result.current.changeAbfahrt('2026-03-10T19:00:00.000Z'));
      act(() => result.current.setAnkunft('2026-03-10T21:00:00.000Z'));

      expect(result.current.overlappingEntries.map((e) => e.id)).toEqual(['e9']);
    });

    it('blockiert eine Überschneidung nicht', async () => {
      // Zeiten sind im Einsatz oft geschätzt — ein Riegel wäre hier falsch.
      const { result, onSubmit } = renderForm({
        entries: [booked],
        firecalls: [],
      });

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.setZiel('Hauptplatz'));
      act(() => result.current.changeAbfahrt('2026-03-10T19:00:00.000Z'));
      act(() => result.current.setAnkunft('2026-03-10T21:00:00.000Z'));

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe('Fahrtstrecke berechnen', () => {
    it('ergänzt den Kilometerstand aus der Route', async () => {
      const resolveDistance = vi
        .fn()
        .mockResolvedValue({ roundTripKm: 24, source: 'route' });
      const { result } = renderForm({
        vehicleId: 'v2',
        activeFirecallId: 'f1',
        resolveDistance,
      });

      await waitFor(() => expect(result.current.canCalculateDistance).toBe(true));
      act(() => result.current.setCounters({ km: { start: 1000 } }));
      await act(async () => {
        await result.current.calculateDistance();
      });

      expect(resolveDistance).toHaveBeenCalledWith('f1');
      expect(result.current.counters.km).toEqual({ start: 1000, end: 1024 });
      expect(result.current.distanceResult).toEqual({
        roundTripKm: 24,
        source: 'route',
      });
    });

    it('meldet einen Einsatz ohne ermittelbare Strecke', async () => {
      const resolveDistance = vi.fn().mockResolvedValue(undefined);
      const { result } = renderForm({
        vehicleId: 'v2',
        activeFirecallId: 'f1',
        resolveDistance,
      });

      await waitFor(() => expect(result.current.canCalculateDistance).toBe(true));
      await act(async () => {
        await result.current.calculateDistance();
      });

      expect(result.current.distanceError).toBe(true);
      expect(result.current.distanceResult).toBeUndefined();
    });

    it('bietet die Berechnung ohne verknüpften Einsatz nicht an', () => {
      // Hinter einem frei eingetippten Namen stehen keine Koordinaten.
      const { result } = renderForm({
        vehicleId: 'v2',
        firecalls: [],
        resolveDistance: vi.fn(),
      });

      expect(result.current.canCalculateDistance).toBe(false);
    });

    it('bietet sie ohne Aktion gar nicht an (Gastformular)', async () => {
      const { result } = renderForm({
        vehicleId: 'v2',
        activeFirecallId: 'f1',
      });

      await waitFor(() => expect(result.current.firecallId).toBe('f1'));
      expect(result.current.canCalculateDistance).toBe(false);
    });
  });

  describe('Ankunft vor Abfahrt', () => {
    it('meldet die verdrehte Reihenfolge sofort, nicht erst beim Speichern', () => {
      const { result } = renderForm();

      act(() => result.current.changeAbfahrt('2026-03-10T18:00:00.000Z'));
      act(() => result.current.setAnkunft('2026-03-10T17:00:00.000Z'));

      expect(result.current.timeOrderInvalid).toBe(true);
    });

    it('speichert eine Ankunft vor der Abfahrt nicht', async () => {
      const { result, onSubmit } = renderForm();

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.setZiel('Hauptplatz'));
      act(() => result.current.changeAbfahrt('2026-03-10T18:00:00.000Z'));
      act(() => result.current.setAnkunft('2026-03-10T17:00:00.000Z'));

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(result.current.errors).toContain('ankunftBeforeAbfahrt');
    });
  });

  describe('changeDriver', () => {
    it('verwirft die Personen-ID, wenn frei weitergetippt wird', () => {
      const { result } = renderForm();

      act(() => result.current.changeDriver('Max Mustermann', 'p1'));
      expect(result.current.driverId).toBe('p1');

      // Freie Eingabe ohne Treffer in der Personenliste.
      act(() => result.current.changeDriver('Max Mustermanne'));
      expect(result.current.driverName).toBe('Max Mustermanne');
      expect(result.current.driverId).toBeUndefined();
    });
  });

  describe('submit', () => {
    it('verwirft den Einsatz, wenn der Zweck wieder gewechselt wird', async () => {
      const { result, onSubmit } = renderForm();

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.setZiel('Hauptplatz'));
      act(() => result.current.changeZweck('einsatz'));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      act(() => result.current.changeZweck('sonstiges'));

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const input = submitted(onSubmit);
      expect(input.zweck).toBe('sonstiges');
      expect(input.firecallId).toBeUndefined();
      expect(input.firecallName).toBeUndefined();
    });

    it('übergibt den Einsatz beim Zweck einsatz', async () => {
      const { result, onSubmit } = renderForm();

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.changeZweck('einsatz'));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));

      await act(async () => {
        await result.current.submit();
      });

      const input = submitted(onSubmit);
      expect(input.firecallId).toBe('f1');
      expect(input.firecallName).toBe('Brand Hauptstraße');
    });

    it('läuft ohne Einsatzliste durch (Gastformular)', async () => {
      const { result, onSubmit } = renderForm({ firecalls: undefined });

      expect(result.current.hasFirecallSelection).toBe(false);

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.changeZweck('einsatz'));
      // Ohne Liste gibt es keine Auswahl — die UI ruft changeFirecall dort
      // nie mit einem Namen auf, trotzdem darf nichts krachen.
      act(() => result.current.changeFirecall('f1', ''));

      let result_: { success: boolean } | undefined;
      await act(async () => {
        result_ = await result.current.submit();
      });

      expect(result_).toEqual({ success: true });
      expect(result.current.errors).toEqual([]);
      const input = submitted(onSubmit);
      expect(input.firecallName).toBeUndefined();
    });

    it('meldet eine vorhandene Einsatzauswahl als solche', () => {
      const { result } = renderForm();
      expect(result.current.hasFirecallSelection).toBe(true);
    });

    it('erkennt eine leere Einsatzliste weiterhin als Auswahl', () => {
      const { result } = renderForm({ firecalls: [] });
      expect(result.current.hasFirecallSelection).toBe(true);
    });

    it('sendet nicht, wenn die Validierung fehlschlägt', async () => {
      // Ein Fahrzeug mit Zähler wird selbst gefahren — ohne Fahrer ist der
      // Eintrag ungültig.
      const { result, onSubmit } = renderForm({ vehicleId: 'v2' });

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(result.current.errors).toContain('driverMissing');
    });

    it('sendet einen Anhänger ohne Zähler auch ohne Fahrer', async () => {
      // Ein Wechselladeaufbau wird aufgenommen, ein Anhänger gezogen — beide
      // haben keinen eigenen Fahrer. Die Fahrerpflicht hätte ihre Erfassung
      // dauerhaft blockiert.
      const { result, onSubmit } = renderForm();

      act(() => result.current.setZiel('Werkstatt'));
      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.errors).toEqual([]);
      expect(onSubmit).toHaveBeenCalled();
      expect(submitted(onSubmit).driverName).toBe('');
    });

    it('verlangt ohne verknüpften Einsatz eine Angabe zur Fahrstrecke', async () => {
      const { result, onSubmit } = renderForm({ firecalls: [] });

      act(() => result.current.changeDriver('Max'));
      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(result.current.errors).toContain('zielMissing');
      expect(result.current.zielCoveredByFirecall).toBe(false);
    });

    it('lässt das Ziel offen, wenn ein Einsatz verknüpft ist', async () => {
      const { result, onSubmit } = renderForm();

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.changeZweck('einsatz'));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));

      expect(result.current.zielCoveredByFirecall).toBe(true);
      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.errors).toEqual([]);
      expect(onSubmit).toHaveBeenCalled();
    });

    it('verlangt das Ziel bei einem nur eingetippten Einsatznamen', async () => {
      // Hinter einem freien Namen steht kein Datensatz — Liste und Export
      // hätten nichts, worauf sie zurückfallen könnten.
      const { result, onSubmit } = renderForm();

      act(() => result.current.changeDriver('Max'));
      act(() => result.current.changeZweck('einsatz'));
      act(() => result.current.changeFirecall(undefined, 'Brand irgendwo'));

      expect(result.current.zielCoveredByFirecall).toBe(false);
      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(result.current.errors).toContain('zielMissing');
    });
  });
});

describe('Zusatzfahrer', () => {
  it('übergibt sie an den Submit-Input', async () => {
    const { result, onSubmit } = renderForm({ vehicleId: 'v2' });

    act(() => {
      result.current.changeDriver('Max Muster', 'p1');
      result.current.changeCoDrivers([{ id: 'p2', name: 'Anna Bauer' }]);
      result.current.setZiel('Übungsgelände');
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(submitted(onSubmit).coDrivers).toEqual([
      { id: 'p2', name: 'Anna Bauer' },
    ]);
  });

  it('übernimmt die Zusatzfahrer eines bearbeiteten Eintrags', () => {
    const { result } = renderForm({
      entry: {
        ...existingEntry(
          localIso(2026, 3, 10, 8, 0),
          localIso(2026, 3, 10, 10, 30),
        ),
        coDrivers: [{ name: 'Anna Bauer' }],
      },
    });
    expect(result.current.coDrivers).toEqual([{ name: 'Anna Bauer' }]);
  });

  it('gibt eine leere Liste, wenn der Eintrag keine hat', () => {
    const { result } = renderForm({ vehicleId: 'v2' });
    expect(result.current.coDrivers).toEqual([]);
  });

  it('meldet die Höchstzahl mit einer übersetzten Meldung', () => {
    const { result } = renderForm({ vehicleId: 'v2' });
    const message = result.current.errorMessage('coDriversTooMany');
    expect(message).toContain('9');
    expect(message).not.toContain('{count}');
  });
});
