import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { counterLines, fuelLines } from './entrySummary';

const kmVehicle = { counters: VEHICLE_PRESETS.fahrzeug };
const bootVehicle = { counters: VEHICLE_PRESETS.boot };

type Entry = Pick<FahrtenbuchEntry, 'counters' | 'betriebsmittel'>;

describe('counterLines', () => {
  it('weist bei einem Kilometerzähler Start, Ende und Differenz aus', () => {
    const entry: Entry = {
      counters: { km: { start: 12340, end: 12362, diff: 22 } },
    };

    expect(counterLines(entry, kmVehicle)).toEqual([
      {
        counterId: 'km',
        labelKey: 'counters.km',
        label: 'Kilometerstand',
        value: '12340 → 12362 km',
        diff: '+22 km',
      },
    ]);
  });

  it('beschriftet jeden Zähler eines Bootes einzeln', () => {
    // Der gemeldete Fall: In der Tabelle stand nur „1 h · 2.1 h · 2.1 h" — ohne
    // Beschriftung war nicht erkennbar, welcher Wert die Betriebsstunden und
    // welcher die Lenzpumpen sind.
    const entry: Entry = {
      counters: {
        betriebsstundenBb: { start: 1245, end: 1246, diff: 1 },
        lenzpumpeStb: { end: 2.1 },
        lenzpumpeBb: { end: 2.1 },
      },
    };

    expect(counterLines(entry, bootVehicle)).toEqual([
      {
        counterId: 'betriebsstundenBb',
        labelKey: 'counters.betriebsstundenBb',
        label: 'Betriebsstunden Backbordmotor',
        value: '1245 → 1246 h',
        diff: '+1 h',
      },
      {
        counterId: 'lenzpumpeStb',
        labelKey: 'counters.lenzpumpeStb',
        label: 'Lenzpumpe Steuerbord',
        value: '2.1 h',
        diff: undefined,
      },
      {
        counterId: 'lenzpumpeBb',
        labelKey: 'counters.lenzpumpeBb',
        label: 'Lenzpumpe Backbord',
        value: '2.1 h',
        diff: undefined,
      },
    ]);
  });

  it('folgt der Reihenfolge der Zählerdefinitionen, nicht der des Eintrags', () => {
    // Die Reihenfolge in `counters` ist die eines Firestore-Objekts und damit
    // beliebig. Wechselte die Spalte von Zeile zu Zeile die Reihenfolge, wäre
    // die Tabelle nicht zu vergleichen.
    const entry: Entry = {
      counters: {
        lenzpumpeBb: { end: 7 },
        betriebsstundenBb: { start: 1, end: 2 },
        lenzpumpeStb: { end: 5 },
      },
    };

    expect(counterLines(entry, bootVehicle).map((l) => l.counterId)).toEqual([
      'betriebsstundenBb',
      'lenzpumpeStb',
      'lenzpumpeBb',
    ]);
  });

  it('rundet eine Fließkomma-Differenz auf zwei Dezimalstellen', () => {
    // 1246,1 − 1245 ergibt in Fließkomma 1,0999999999999943 — in einer Tabelle
    // unbrauchbar.
    const entry: Entry = {
      counters: { betriebsstundenBb: { start: 1245, end: 1246.1 } },
    };

    expect(counterLines(entry, bootVehicle)[0].diff).toBe('+1.1 h');
  });

  it('rechnet die Differenz aus Start und Ende, nicht aus einem mitgeschleppten diff', () => {
    // Nach einer Korrektur des Endstands kann ein altes `diff` am Eintrag der
    // eigenen Spanne widersprechen.
    const entry: Entry = {
      counters: { km: { start: 1000, end: 1050, diff: 20 } },
    };

    expect(counterLines(entry, kmVehicle)[0].diff).toBe('+50 km');
  });

  it('weist eine negative Differenz als solche aus', () => {
    const entry: Entry = { counters: { km: { start: 1000, end: 995 } } };
    expect(counterLines(entry, kmVehicle)[0].diff).toBe('-5 km');
  });

  it('macht einen fehlenden Endstand als Lücke sichtbar', () => {
    // Etwa aus der Sammelerfassung ohne Route. „12340 km" allein sähe wie eine
    // Ablesung aus.
    const entry: Entry = { counters: { km: { start: 12340 } } };
    const [line] = counterLines(entry, kmVehicle);
    expect(line.value).toBe('12340 → ? km');
    expect(line.diff).toBeUndefined();
  });

  it('zeigt die Stände auch, wenn das Fahrzeug noch nicht geladen ist', () => {
    // Dann fehlen Beschriftung und Einheit, aber die Zahlen stehen da. Eine
    // leere Zelle sähe aus wie eine Fahrt ohne erfasste Zählerstände.
    const entry: Entry = { counters: { km: { start: 1000, end: 1010 } } };
    expect(counterLines(entry, undefined)).toEqual([
      { counterId: 'km', label: 'km', value: '1000 → 1010', diff: '+10' },
    ]);
  });

  it('überspringt Zähler, zu denen der Eintrag keinen Wert hat', () => {
    const entry: Entry = { counters: { betriebsstundenBb: { start: 1, end: 2 } } };
    expect(counterLines(entry, bootVehicle).map((l) => l.counterId)).toEqual([
      'betriebsstundenBb',
    ]);
  });

  it('zeigt einen Zähler auch ohne Definition am Fahrzeug', () => {
    // Nach einem Wechsel der Zähler-Vorlage stünde der erfasste Wert sonst
    // nirgends mehr — in einem Nachweisdokument darf er nicht verschwinden.
    const entry: Entry = { counters: { km: { start: 1000, end: 1020 } } };

    expect(counterLines(entry, bootVehicle)).toEqual([
      {
        counterId: 'km',
        label: 'km',
        value: '1000 → 1020',
        diff: '+20',
      },
    ]);
  });

  it('verträgt einen Eintrag ohne Zähler', () => {
    expect(counterLines({} as FahrtenbuchEntry, kmVehicle)).toEqual([]);
  });

  it('verträgt ein Fahrzeug ohne Zähler', () => {
    const entry: Entry = { counters: {} };
    expect(counterLines(entry, {} as FahrtenbuchVehicle)).toEqual([]);
  });
});

describe('fuelLines', () => {
  it('liefert die getankten Mengen in fester Reihenfolge', () => {
    const entry = { betriebsmittel: { adblue: 5, diesel: 40 } };

    expect(fuelLines(entry)).toEqual([
      { fuel: 'diesel', amount: 40 },
      { fuel: 'adblue', amount: 5 },
    ]);
  });

  it('lässt Nullmengen und ungültige Werte weg', () => {
    // „Diesel: 0" ist keine Tankung, sondern ein leer gelassenes Feld.
    const entry = {
      betriebsmittel: { diesel: 0, benzin: Number.NaN, adblue: 5 },
    } as Entry;

    expect(fuelLines(entry)).toEqual([{ fuel: 'adblue', amount: 5 }]);
  });

  it('verträgt einen Eintrag ohne Betriebsmittel', () => {
    expect(fuelLines({})).toEqual([]);
  });
});
