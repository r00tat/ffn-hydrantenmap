import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand } from './geraet';
import {
  GERAET_EXPORT_COLUMNS,
  parseExportDate,
  parseGeraetExport,
  planGeraetImport,
  suggestConsumable,
  type ParsedGeraet,
} from './geraetImport';

const HEADER = Object.values(GERAET_EXPORT_COLUMNS);

/** Baut eine Zeile aus einem Objekt, damit die Tests lesbar bleiben. */
function row(values: Record<string, string>): string[] {
  return HEADER.map((column) => values[column] ?? '');
}

const BINDER = {
  ID: '1001',
  Bezeichnung: 'Ölbindemittel Sack 20 l',
  Kategorie: 'Gerät',
  'Klasse 1': 'Schadstoff',
  'Material-Typ': 'Massenartikel',
  'Einheit Verwendungsnachweis': 'stk',
  Status: 'aktiv',
};

describe('GERAET_EXPORT_COLUMNS', () => {
  it('enthält die Spalten des Sybos-Exports', () => {
    expect(HEADER).toEqual(
      expect.arrayContaining([
        'ID',
        'Bezeichnung',
        'Inventar-Nr.',
        'Zusatz-Inventar-Nr.',
        'Barcodes',
        'Kategorie',
        'Klasse 1',
        'Klasse 2',
        'Klasse 3',
        'Material-Typ',
        'Hersteller/Marke',
        'Hersteller-Typen Bezeichnung',
        'Herstellungs-Jahr (Baujahr)',
        'Seriennummer',
        'Bemerkung',
        'Besitzer',
        'Status',
        'Einheit Verwendungsnachweis',
        'Lagerort',
        'Fahrzeug-Name',
        'Laderaum',
        'Standort',
        'Raum',
        'Anzahl',
        'Lagerort-Bemerkung',
      ]),
    );
  });
});

describe('parseGeraetExport', () => {
  it('liefert für eine leere Datei nichts', () => {
    expect(parseGeraetExport([])).toEqual({ artikel: [], errors: [], withBestand: true });
  });

  it('meldet fehlende Pflichtspalten', () => {
    const result = parseGeraetExport([['Bezeichnung', 'Anzahl']]);
    expect(result.artikel).toEqual([]);
    expect(result.errors).toEqual([
      expect.stringContaining('ID'),
    ]);
  });

  it('gruppiert die Zeilen nach ID, je Zeile ein Lagerort', () => {
    const { artikel, errors } = parseGeraetExport([
      HEADER,
      row({
        ...BINDER,
        Lagerort: 'Fahrzeug',
        'Fahrzeug-Name': 'SRF',
        Laderaum: 'GR 2',
        Anzahl: '4',
      }),
      row({
        ...BINDER,
        Lagerort: 'Raum',
        Standort: 'Feuerwehrhaus',
        Raum: 'Lager',
        Anzahl: '10',
        'Lagerort-Bemerkung': 'Regal 3 ',
      }),
      row({
        ID: '1002',
        Bezeichnung: 'Kupplungsschlüssel',
        'Material-Typ': 'Massenartikel',
        Lagerort: 'Fahrzeug',
        'Fahrzeug-Name': 'SRF',
        Laderaum: 'GR 1',
        Anzahl: '2',
      }),
    ]);
    expect(errors).toEqual([]);
    expect(artikel).toHaveLength(2);

    const [binder, schluessel] = artikel;
    expect(binder.externeId).toBe('1001');
    expect(binder.bestaende).toEqual([
      {
        lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
        lagerortKey: 'fahrzeug|srf|gr 2',
        anzahl: 4,
      },
      {
        lagerort: {
          art: 'raum',
          standort: 'Feuerwehrhaus',
          raum: 'Lager',
          bemerkung: 'Regal 3',
        },
        lagerortKey: 'raum|feuerwehrhaus|lager',
        anzahl: 10,
      },
    ]);
    expect(schluessel.externeId).toBe('1002');
    expect(schluessel.bestaende).toHaveLength(1);
  });

  it('übernimmt die Stammdaten ohne leere Felder', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({
        ID: '2001',
        Bezeichnung: 'Hebekissen 12 t',
        'Inventar-Nr.': 'INV-7',
        'Zusatz-Inventar-Nr.': '2001',
        Barcodes: '0315-8828, 0915-0127',
        Kategorie: 'Gerät',
        'Klasse 1': 'Technische Geräte',
        'Klasse 2': 'Hebegeräte',
        'Material-Typ': 'Einzelartikel',
        'Hersteller/Marke': 'Musterwerk',
        'Hersteller-Typen Bezeichnung': 'HK-12',
        'Herstellungs-Jahr (Baujahr)': '2019',
        Seriennummer: 'SN-42',
        Bemerkung: 'Prüfung jährlich',
        Besitzer: 'Stadtgemeinde Musterstadt',
        Status: 'aktiv',
        'Einheit Verwendungsnachweis': 'h',
        Lagerort: 'Fahrzeug',
        'Fahrzeug-Name': 'SRF',
        Laderaum: 'GR 3',
        Anzahl: '1',
      }),
    ]);
    expect(artikel[0].stammdaten).toEqual({
      externeId: '2001',
      bezeichnung: 'Hebekissen 12 t',
      inventarNr: 'INV-7',
      zusatzInventarNr: '2001',
      barcodes: ['0315-8828', '0915-0127'],
      kategorie: 'Gerät',
      klasse1: 'Technische Geräte',
      klasse2: 'Hebegeräte',
      materialTyp: 'Einzelartikel',
      hersteller: 'Musterwerk',
      herstellerTyp: 'HK-12',
      baujahr: 2019,
      seriennummer: 'SN-42',
      bemerkung: 'Prüfung jährlich',
      besitzer: 'Stadtgemeinde Musterstadt',
      einheitVerwendungsnachweis: 'h',
      active: true,
    });
    // Kein Feld darf `undefined` tragen — Firestore lehnt das ab.
    for (const value of Object.values(artikel[0].stammdaten)) {
      expect(value).not.toBeUndefined();
    }
  });

  it('übernimmt Vorlage, Zubehör, Daten und Lebensdauer', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({
        ID: '3001',
        Bezeichnung: 'Mehrgasmessgerät 1',
        Vorlage: 'Gasmessgerät',
        'Zubehör': 'Lademodul\nPumpe',
        'Anschaffungs-Datum': '42205',
        'Verfügbar bis': '2025-01-20',
        Lebensdauer: '10',
        Einheit: 'Jahr(e)',
        Status: 'aktiv',
      }),
      row({ ID: '3002', Bezeichnung: 'Ohne Lebensdauer', Einheit: 'Monat(e)', Status: 'aktiv' }),
    ]);
    expect(artikel[0].stammdaten).toMatchObject({
      vorlage: 'Gasmessgerät',
      zubehoer: 'Lademodul\nPumpe',
      anschaffungsDatum: '2015-07-20',
      verfuegbarBis: '2025-01-20',
      lebensdauer: 10,
      lebensdauerEinheit: 'Jahr(e)',
    });
    // Die Einheit allein ist keine Angabe — sie steht im Export in jeder Zeile.
    expect(artikel[1].stammdaten).not.toHaveProperty('lebensdauerEinheit');
    expect(artikel[1].stammdaten).not.toHaveProperty('lebensdauer');
  });

  it('kennt die vier Material-Typen und verwirft unbekannte', () => {
    const typen = ['Einzelartikel', 'Massenartikel', 'Set-Artikel', 'Set-Komponente', 'Anderes'];
    const { artikel } = parseGeraetExport([
      HEADER,
      ...typen.map((typ, i) =>
        row({ ID: `${i}`, Bezeichnung: `Artikel ${i}`, 'Material-Typ': typ }),
      ),
    ]);
    expect(artikel.map((a) => a.stammdaten.materialTyp)).toEqual([
      'Einzelartikel',
      'Massenartikel',
      'Set-Artikel',
      'Set-Komponente',
      undefined,
    ]);
  });

  it('liest die Einheit des Verwendungsnachweises, "-" heißt keine', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({ ID: '1', Bezeichnung: 'A', 'Einheit Verwendungsnachweis': '-' }),
      row({ ID: '2', Bezeichnung: 'B', 'Einheit Verwendungsnachweis': 'stk' }),
      row({ ID: '3', Bezeichnung: 'C', 'Einheit Verwendungsnachweis': 'H' }),
    ]);
    expect(artikel.map((a) => a.stammdaten.einheitVerwendungsnachweis)).toEqual(
      [undefined, 'stk', 'h'],
    );
  });

  it('übernimmt inaktive Artikel als inaktiv', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({ ...BINDER, Status: 'inaktiv', Lagerort: 'Raum', Raum: 'Lager', Anzahl: '1' }),
    ]);
    expect(artikel).toHaveLength(1);
    expect(artikel[0].stammdaten.active).toBe(false);
  });

  it('kennt den Set-Artikel als Lagerort', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({
        ID: '3001',
        Bezeichnung: 'Airbagsicherung',
        'Material-Typ': 'Set-Komponente',
        Lagerort: 'Set-Artikel',
        Anzahl: '1',
      }),
    ]);
    expect(artikel[0].bestaende).toEqual([
      { lagerort: { art: 'set' }, lagerortKey: 'set', anzahl: 1 },
    ]);
  });

  it('legt Artikel ohne Lagerort ohne Bestand an', () => {
    const { artikel, errors } = parseGeraetExport([
      HEADER,
      row({ ID: '4001', Bezeichnung: 'Rettungsleine', 'Material-Typ': 'Einzelartikel' }),
    ]);
    expect(errors).toEqual([]);
    expect(artikel[0].bestaende).toEqual([]);
  });

  it('liest Anzahlen mit Komma und setzt bei Einzelartikeln ohne Anzahl 1', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({ ID: '1', Bezeichnung: 'A', Lagerort: 'Raum', Raum: 'Lager', Anzahl: '2,5' }),
      row({
        ID: '2',
        Bezeichnung: 'B',
        'Material-Typ': 'Einzelartikel',
        Lagerort: 'Raum',
        Raum: 'Lager',
      }),
      row({
        ID: '3',
        Bezeichnung: 'C',
        'Material-Typ': 'Massenartikel',
        Lagerort: 'Raum',
        Raum: 'Lager',
      }),
    ]);
    expect(artikel.map((a) => a.bestaende[0].anzahl)).toEqual([2.5, 1, 0]);
  });

  it('meldet eine unlesbare Anzahl und zählt sie als 0', () => {
    const { artikel, errors } = parseGeraetExport([
      HEADER,
      row({ ID: '1', Bezeichnung: 'A', Lagerort: 'Raum', Raum: 'Lager', Anzahl: 'viele' }),
    ]);
    expect(artikel[0].bestaende[0].anzahl).toBe(0);
    expect(errors).toEqual([expect.stringContaining('viele')]);
  });

  it('meldet einen unbekannten Lagerort und legt dafür keinen Bestand an', () => {
    const { artikel, errors } = parseGeraetExport([
      HEADER,
      row({ ID: '1', Bezeichnung: 'A', Lagerort: 'Person', Anzahl: '1' }),
    ]);
    expect(artikel[0].bestaende).toEqual([]);
    expect(errors).toEqual([expect.stringContaining('Person')]);
  });

  it('fasst doppelte Lagerorte desselben Artikels zusammen', () => {
    const { artikel, errors } = parseGeraetExport([
      HEADER,
      row({ ...BINDER, Lagerort: 'Raum', Raum: 'Lager', Anzahl: '2' }),
      row({ ...BINDER, Lagerort: 'Raum', Raum: 'lager ', Anzahl: '3' }),
    ]);
    expect(artikel[0].bestaende).toHaveLength(1);
    expect(artikel[0].bestaende[0].anzahl).toBe(5);
    expect(errors).toEqual([expect.stringContaining('1001')]);
  });

  it('überspringt leere Zeilen still und meldet Zeilen ohne ID', () => {
    const { artikel, errors } = parseGeraetExport([
      HEADER,
      row({}),
      row({ Bezeichnung: 'Ohne Kennung' }),
      row(BINDER),
    ]);
    expect(artikel).toHaveLength(1);
    expect(errors).toEqual([expect.stringContaining('Zeile 3')]);
  });

  it('schlägt Verbrauchsmaterial aus der Kategorie vor', () => {
    const { artikel } = parseGeraetExport([
      HEADER,
      row({ ...BINDER, Kategorie: 'Gerät' }),
      row({ ...BINDER, ID: '1009', Kategorie: 'Verbrauchsmaterial' }),
    ]);
    expect(artikel.map((a) => a.suggestedConsumable)).toEqual([false, true]);
  });
});

describe('suggestConsumable', () => {
  it('sieht im Gerät kein Verbrauchsmaterial', () => {
    expect(suggestConsumable('Gerät')).toBe(false);
    expect(suggestConsumable(undefined)).toBe(false);
  });

  it('erkennt Verbrauchsmaterial und Lagerartikel', () => {
    expect(suggestConsumable('Verbrauchsmaterial')).toBe(true);
    expect(suggestConsumable('Lagerartikel')).toBe(true);
  });
});

// --- Abgleich ----------------------------------------------------------------

const TS = '2026-01-01T00:00:00.000Z';

function geraet(overrides: Partial<Geraet> & { id: string }): Geraet {
  return {
    bezeichnung: 'Ölbindemittel Sack 20 l',
    externeId: overrides.id,
    verbrauchsmaterial: true,
    bestandGesamt: 0,
    active: true,
    createdAt: TS,
    createdBy: 'import',
    updatedAt: TS,
    updatedBy: 'import',
    ...overrides,
  };
}

function bestand(
  overrides: Partial<GeraetBestand> & { id: string; geraetId: string },
): GeraetBestand {
  return {
    lagerortKey: 'raum|feuerwehrhaus|lager',
    lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
    anzahl: 0,
    ...overrides,
  };
}

function parsed(
  externeId: string,
  bestaende: { lagerortKey: string; anzahl: number }[],
  stammdaten: Partial<ParsedGeraet['stammdaten']> = {},
): ParsedGeraet {
  return {
    externeId,
    suggestedConsumable: false,
    stammdaten: {
      externeId,
      bezeichnung: 'Ölbindemittel Sack 20 l',
      active: true,
      ...stammdaten,
    },
    bestaende: bestaende.map((b) => ({
      ...b,
      lagerort:
        b.lagerortKey === 'fahrzeug|srf|gr 2'
          ? { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' }
          : { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
    })),
  };
}

const LAGER = 'raum|feuerwehrhaus|lager';
const SRF = 'fahrzeug|srf|gr 2';
const noBookings = () => false;

describe('planGeraetImport', () => {
  it('legt beim Erstimport Artikel und Bestände an', () => {
    const plan = planGeraetImport(
      [parsed('1001', [{ lagerortKey: LAGER, anzahl: 10 }, { lagerortKey: SRF, anzahl: 4 }])],
      { geraete: [], bestaende: [], hasBookingsSinceImport: noBookings },
    );
    expect(plan.create.map((p) => p.externeId)).toEqual(['1001']);
    expect(plan.update).toEqual([]);
    expect(plan.bestandCreate).toEqual([
      expect.objectContaining({ geraetId: '1001', lagerortKey: LAGER, anzahl: 10 }),
      expect.objectContaining({ geraetId: '1001', lagerortKey: SRF, anzahl: 4 }),
    ]);
    expect(plan.deviations).toEqual([]);
    expect(plan.bestandUpdate).toEqual([]);
  });

  it('erkennt einen vorhandenen Artikel an der Sybos-ID', () => {
    const plan = planGeraetImport(
      [parsed('1001', [], { bezeichnung: 'Ölbindemittel Sack 25 l' })],
      {
        geraete: [geraet({ id: 'abc', externeId: '1001' })],
        bestaende: [],
        hasBookingsSinceImport: noBookings,
      },
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([
      expect.objectContaining({
        geraetId: 'abc',
        changedFields: ['bezeichnung'],
        removedFields: [],
      }),
    ]);
    expect(plan.update[0].stammdaten.bezeichnung).toBe('Ölbindemittel Sack 25 l');
  });

  it('lässt unveränderte Stammdaten aus der Aktualisierung heraus', () => {
    const plan = planGeraetImport([parsed('1001', [])], {
      geraete: [geraet({ id: '1001' })],
      bestaende: [],
      hasBookingsSinceImport: noBookings,
    });
    expect(plan.update).toEqual([]);
    expect(plan.unchanged).toEqual(['1001']);
  });

  it('meldet in Sybos geleerte Felder zum Entfernen', () => {
    const plan = planGeraetImport([parsed('1001', [])], {
      geraete: [geraet({ id: '1001', bemerkung: 'alt', barcodes: ['x'] })],
      bestaende: [],
      hasBookingsSinceImport: noBookings,
    });
    expect(plan.update[0].removedFields.sort()).toEqual(['barcodes', 'bemerkung']);
  });

  it('fasst die händisch gepflegten Felder nicht an', () => {
    // Verbrauchsmaterial, Mindestbestand & Co. kommen nicht aus Sybos.
    const plan = planGeraetImport([parsed('1001', [])], {
      geraete: [
        geraet({
          id: '1001',
          verbrauchsmaterial: true,
          mindestbestand: 5,
          einheit: 'Sack',
          kostenersatzRateId: '12.05',
        }),
      ],
      bestaende: [],
      hasBookingsSinceImport: noBookings,
    });
    expect(plan.update).toEqual([]);
  });

  it('lässt gleiche Bestände unverändert', () => {
    const plan = planGeraetImport(
      [parsed('1001', [{ lagerortKey: LAGER, anzahl: 10 }])],
      {
        geraete: [geraet({ id: '1001' })],
        bestaende: [bestand({ id: 'b1', geraetId: '1001', anzahl: 10 })],
        hasBookingsSinceImport: () => true,
      },
    );
    expect(plan.bestandUnchanged).toEqual([
      { geraetId: '1001', bestandId: 'b1', lagerortKey: LAGER },
    ]);
    expect(plan.deviations).toEqual([]);
    expect(plan.bestandUpdate).toEqual([]);
  });

  it('übernimmt geänderte Bestände ohne Buchungen seit dem Import', () => {
    const plan = planGeraetImport(
      [parsed('1001', [{ lagerortKey: LAGER, anzahl: 12 }])],
      {
        geraete: [geraet({ id: '1001' })],
        bestaende: [bestand({ id: 'b1', geraetId: '1001', anzahl: 10 })],
        hasBookingsSinceImport: noBookings,
      },
    );
    expect(plan.bestandUpdate).toEqual([
      { geraetId: '1001', bestandId: 'b1', lagerortKey: LAGER, current: 10, imported: 12 },
    ]);
    expect(plan.deviations).toEqual([]);
  });

  it('überschreibt Bestände mit Buchungen seit dem Import nicht stillschweigend', () => {
    const plan = planGeraetImport(
      [parsed('1001', [{ lagerortKey: LAGER, anzahl: 12 }, { lagerortKey: SRF, anzahl: 3 }])],
      {
        geraete: [geraet({ id: '1001' })],
        bestaende: [bestand({ id: 'b1', geraetId: '1001', anzahl: 7 })],
        hasBookingsSinceImport: (id) => id === '1001',
      },
    );
    expect(plan.bestandUpdate).toEqual([]);
    expect(plan.bestandCreate).toEqual([]);
    expect(plan.deviations).toEqual([
      { geraetId: '1001', bestandId: 'b1', lagerortKey: LAGER, current: 7, imported: 12 },
      // Ein neuer Lagerort bei gebuchtem Artikel ist ebenfalls eine Abweichung,
      // aber ohne vorhandenen Bestand.
      { geraetId: '1001', lagerortKey: SRF, current: 0, imported: 3 },
    ]);
  });

  it('legt neue Lagerorte ohne Buchungen direkt an', () => {
    const plan = planGeraetImport(
      [parsed('1001', [{ lagerortKey: SRF, anzahl: 3 }])],
      {
        geraete: [geraet({ id: '1001' })],
        bestaende: [],
        hasBookingsSinceImport: noBookings,
      },
    );
    expect(plan.bestandCreate).toEqual([
      expect.objectContaining({ geraetId: '1001', lagerortKey: SRF, anzahl: 3 }),
    ]);
  });

  it('setzt verschwundene Lagerorte auf 0 bzw. meldet sie als Abweichung', () => {
    const existing = {
      geraete: [geraet({ id: '1001' })],
      bestaende: [
        bestand({ id: 'b1', geraetId: '1001', anzahl: 4 }),
        bestand({ id: 'b2', geraetId: '1001', lagerortKey: SRF, anzahl: 0 }),
      ],
    };
    const ohne = planGeraetImport([parsed('1001', [])], {
      ...existing,
      hasBookingsSinceImport: noBookings,
    });
    expect(ohne.bestandUpdate).toEqual([
      { geraetId: '1001', bestandId: 'b1', lagerortKey: LAGER, current: 4, imported: 0 },
    ]);
    // Ein ohnehin leerer Lagerort bleibt einfach stehen.
    expect(ohne.bestandUnchanged).toEqual([
      { geraetId: '1001', bestandId: 'b2', lagerortKey: SRF },
    ]);

    const mit = planGeraetImport([parsed('1001', [])], {
      ...existing,
      hasBookingsSinceImport: () => true,
    });
    expect(mit.deviations).toEqual([
      { geraetId: '1001', bestandId: 'b1', lagerortKey: LAGER, current: 4, imported: 0 },
    ]);
  });

  it('lässt Artikel, die nicht in der Datei stehen, in Ruhe', () => {
    // Geräte und Lagerartikel kommen aus getrennten Exporten.
    const plan = planGeraetImport([parsed('1001', [])], {
      geraete: [geraet({ id: '1001' }), geraet({ id: '9999' })],
      bestaende: [bestand({ id: 'b9', geraetId: '9999', anzahl: 3 })],
      hasBookingsSinceImport: noBookings,
    });
    expect(JSON.stringify(plan)).not.toContain('9999');
  });

  it('listet inaktive Artikel', () => {
    const plan = planGeraetImport(
      [parsed('1001', [], { active: false }), parsed('1002', [], { active: false })],
      {
        geraete: [geraet({ id: 'abc', externeId: '1001' })],
        bestaende: [],
        hasBookingsSinceImport: noBookings,
      },
    );
    expect(plan.inactive).toEqual(['abc', '1002']);
  });

  it('ist serialisierbar', () => {
    const plan = planGeraetImport(
      [parsed('1001', [{ lagerortKey: LAGER, anzahl: 1 }])],
      { geraete: [], bestaende: [], hasBookingsSinceImport: noBookings },
    );
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});

describe('parseExportDate', () => {
  it('liest Excel-Seriennummern, auch mit Uhrzeit', () => {
    expect(parseExportDate('42205')).toBe('2015-07-20');
    expect(parseExportDate('44946.5')).toBe('2023-01-20');
  });

  it('nimmt ISO-Daten an und verwirft Unlesbares', () => {
    expect(parseExportDate('2034-02-12 00:00:00')).toBe('2034-02-12');
    expect(parseExportDate('')).toBeUndefined();
    expect(parseExportDate('demnächst')).toBeUndefined();
    expect(parseExportDate('12')).toBeUndefined();
  });
});

describe('Bestand, den der Export nicht kennt', () => {
  it('setzt einen Container-Lagerort aus der App beim Import nicht auf 0', () => {
    const plan = planGeraetImport([parsed('1001', [{ lagerortKey: LAGER, anzahl: 5 }])], {
      geraete: [geraet({ id: '1001' })],
      bestaende: [
        bestand({ id: 'b1', geraetId: '1001', anzahl: 5 }),
        bestand({
          id: 'b2',
          geraetId: '1001',
          lagerortKey: 'container|c1',
          lagerort: { art: 'container', container: 'Ölsperren 1', containerId: 'c1' },
          anzahl: 3,
        }),
      ],
      hasBookingsSinceImport: noBookings,
    });
    expect(plan.bestandUpdate).toEqual([]);
    expect(plan.deviations).toEqual([]);
  });

  it('lässt ohne Lagerort-Spalten jeden Bestand unangetastet', () => {
    const plan = planGeraetImport(
      [parsed('1001', [])],
      {
        geraete: [geraet({ id: '1001' })],
        bestaende: [bestand({ id: 'b1', geraetId: '1001', anzahl: 5 })],
        hasBookingsSinceImport: () => true,
      },
      { withBestand: false },
    );
    expect(plan.bestandUpdate).toEqual([]);
    expect(plan.deviations).toEqual([]);
    expect(plan.bestandCreate).toEqual([]);
  });

  it('erkennt eine Datei ohne Lagerort-Spalten und sagt es', () => {
    const header = HEADER.filter(
      (c) => !['Lagerort', 'Fahrzeug-Name', 'Laderaum', 'Standort', 'Raum', 'Anzahl'].includes(c),
    );
    const result = parseGeraetExport([
      header,
      header.map((c) => (({ ID: '1', Bezeichnung: 'Abschleppseil' }) as Record<string, string>)[c] ?? ''),
    ]);
    expect(result.withBestand).toBe(false);
    expect(result.artikel).toHaveLength(1);
    expect(result.errors).toEqual([
      expect.stringMatching(/ohne Lagerort-Spalten.*Bestand bleibt unverändert/),
    ]);
    expect(parseGeraetExport([HEADER]).withBestand).toBe(true);
  });
});
