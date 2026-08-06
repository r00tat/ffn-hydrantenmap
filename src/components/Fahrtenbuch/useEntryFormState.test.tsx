// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { IntlWrapper } from '../../test-utils/intlRender';
import type { FahrtenbuchEntryInput } from './entryLogic';
import {
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

function renderForm(options: Partial<UseEntryFormStateOptions> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ success: true });
  const { result } = renderHook(
    () =>
      useEntryFormState({
        vehicles,
        firecalls,
        vehicleId: 'v1',
        onSubmit,
        ...options,
      }),
    { wrapper: IntlWrapper },
  );
  return { result, onSubmit };
}

/** Der zuletzt an `onSubmit` übergebene Eintrag. */
function submitted(onSubmit: ReturnType<typeof vi.fn>): FahrtenbuchEntryInput {
  return onSubmit.mock.calls.at(-1)![0] as FahrtenbuchEntryInput;
}

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
      act(() => result.current.setZweck('einsatz'));
      act(() => result.current.changeFirecall('f1', 'Brand Hauptstraße'));
      act(() => result.current.setZweck('sonstiges'));

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
      act(() => result.current.setZweck('einsatz'));
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
      act(() => result.current.setZweck('einsatz'));
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
      const { result, onSubmit } = renderForm();

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
      act(() => result.current.setZweck('einsatz'));
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
      act(() => result.current.setZweck('einsatz'));
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
