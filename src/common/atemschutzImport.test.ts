import { describe, expect, it } from 'vitest';
import type { AtemschutzGeraet } from './atemschutz';
import {
  ARTIKEL_SPALTEN,
  abgleich,
  parseBarcodes,
  rowsToGeraete,
  standortAusBezeichnung,
  typAusKlassen,
  werteAusBezeichnung,
} from './atemschutzImport';

const KOPF = [
  'ID',
  'Bezeichnung',
  'Inventar-Nr.',
  'Zusatz-Inventar-Nr.',
  'Barcodes',
  'Kategorie',
  'Klasse 1',
  'Klasse 2',
  'Klasse 3',
  'Dienststelle',
  'Status',
  'Hersteller/Marke',
  'Herstellungs-Jahr (Baujahr)',
  'Seriennummer',
  'Bemerkung',
];

/** Baut eine Zeile aus einem Objekt, damit die Tests lesbar bleiben. */
function row(values: Record<string, string>): string[] {
  return KOPF.map((spalte) => values[spalte] ?? '');
}

describe('typAusKlassen', () => {
  it('bildet die vier vorkommenden Klasse-3-Werte ab', () => {
    expect(typAusKlassen({ klasse3: 'Atemluftflasche' })).toBe('flasche');
    expect(typAusKlassen({ klasse3: 'Atemmaske' })).toBe('maske');
    expect(typAusKlassen({ klasse3: 'Atemschutzgerät' })).toBe('pressluftatmer');
    expect(typAusKlassen({ klasse3: 'Zubehör' })).toBe('zubehoer');
  });

  it('erkennt die Füllstation an der Atemlufterzeugung', () => {
    // Der Füllstationsexport hat keine Klasse 3 — dort steht der Typ in
    // Klasse 1 ("Atemlufterzeugung") und Klasse 2.
    expect(
      typAusKlassen({
        klasse1: 'Atemlufterzeugung',
        klasse2: 'Atemluftfüllstation',
      }),
    ).toBe('fuellstation');
    expect(
      typAusKlassen({
        klasse1: 'Atemlufterzeugung',
        klasse2: 'Atemluftkompressor',
      }),
    ).toBe('fuellstation');
  });

  it('lässt Klasse 3 vor den gröberen Klassen gehen', () => {
    // Im Geräteexport steht in Klasse 2 durchgehend "Pressluftatmer", auch bei
    // Masken. Würde Klasse 2 mitentscheiden, wäre jede Maske ein Pressluftatmer.
    expect(
      typAusKlassen({
        klasse1: 'Atemschutzgeräte',
        klasse2: 'Pressluftatmer',
        klasse3: 'Atemmaske',
      }),
    ).toBe('maske');
  });

  it('behandelt eine leere Klasse als Zubehör', () => {
    // 33 der 214 Zeilen haben keine Klasse 3.
    expect(typAusKlassen({})).toBe('zubehoer');
    expect(typAusKlassen({ klasse3: 'Unbekanntes' })).toBe('zubehoer');
    // Klasse 2 allein macht noch keine Füllstation.
    expect(typAusKlassen({ klasse2: 'Pressluftatmer' })).toBe('zubehoer');
  });

  it('ignoriert Groß-/Kleinschreibung und Randleerzeichen', () => {
    expect(typAusKlassen({ klasse3: '  atemluftflasche ' })).toBe('flasche');
    expect(typAusKlassen({ klasse1: ' ATEMLUFTERZEUGUNG ' })).toBe(
      'fuellstation',
    );
  });
});

describe('standortAusBezeichnung', () => {
  it('liest den Standort aus dem Klartext', () => {
    expect(standortAusBezeichnung('Atemluftfüllstation Stationär')).toBe('fix');
    expect(standortAusBezeichnung('Atemluftkompressor Mobil')).toBe('mobil');
  });

  it('bleibt ohne Hinweis unbestimmt', () => {
    // "Füllstation" endet zwar auf "station", sagt aber nichts über den
    // Standort — geraten wird hier nichts.
    expect(standortAusBezeichnung('Atemluftfüllstation')).toBeUndefined();
    expect(standortAusBezeichnung('')).toBeUndefined();
  });
});

describe('werteAusBezeichnung', () => {
  it('liest Material und Volumen aus einer CFK-Bezeichnung', () => {
    expect(werteAusBezeichnung('Atemluftflasche CFK 6,8 l')).toEqual({
      material: 'CFK',
      volumenLiter: 6.8,
    });
  });

  it('liest Material und Volumen aus einer Stahl-Bezeichnung', () => {
    expect(werteAusBezeichnung('Atemluftflasche Stahl 10 l')).toEqual({
      material: 'Stahl',
      volumenLiter: 10,
    });
  });

  it('erkennt die Bezirksreserve', () => {
    expect(
      werteAusBezeichnung('Atemluftflasche Stahl 6 l Bezirksreserve'),
    ).toEqual({
      material: 'Stahl',
      volumenLiter: 6,
      bezirksreserve: true,
    });
  });

  it('liefert für eine Maske weder Material noch Volumen', () => {
    expect(werteAusBezeichnung('Vollatemmaske')).toEqual({});
  });
});

describe('parseBarcodes', () => {
  it('nimmt einen einzelnen Code als einelementige Liste', () => {
    expect(parseBarcodes('4026056001293')).toEqual(['4026056001293']);
  });

  it('trennt an Komma, Semikolon, Zeilenumbruch und Leerzeichen', () => {
    expect(parseBarcodes('AAA111, BBB222;CCC333\nDDD444 EEE555')).toEqual([
      'AAA111',
      'BBB222',
      'CCC333',
      'DDD444',
      'EEE555',
    ]);
  });

  it('liefert für eine leere Zelle eine leere Liste', () => {
    expect(parseBarcodes('')).toEqual([]);
    expect(parseBarcodes('  ,  ; ')).toEqual([]);
  });

  it('entfernt Dubletten innerhalb einer Zelle', () => {
    expect(parseBarcodes('AAA111, AAA111')).toEqual(['AAA111']);
  });
});

describe('rowsToGeraete', () => {
  it('bildet eine vollständige Zeile ab', () => {
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        ID: '96176',
        Bezeichnung: 'Atemluftflasche CFK 6,8 l',
        'Inventar-Nr.': '2016-FL-038',
        Barcodes: '4026056001293',
        'Klasse 3': 'Atemluftflasche',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
        'Hersteller/Marke': 'Interspiro',
        'Herstellungs-Jahr (Baujahr)': '2023',
        Seriennummer: 'BA66937',
      }),
    ]);
    expect(geraet).toMatchObject({
      externeId: '96176',
      bezeichnung: 'Atemluftflasche CFK 6,8 l',
      inventarNr: '2016-FL-038',
      barcodes: ['4026056001293'],
      typ: 'flasche',
      feuerwehr: 'Neusiedl am See',
      active: true,
      hersteller: 'Interspiro',
      baujahr: 2023,
      seriennummer: 'BA66937',
      material: 'CFK',
      volumenLiter: 6.8,
      nenndruck: 300,
    });
  });

  it('leitet die Flaschennummer aus der Zusatz-Inventar-Nr. ab', () => {
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Atemluftflasche Stahl 1 l',
        'Zusatz-Inventar-Nr.': 'AF-2.16.19',
        'Klasse 3': 'Atemluftflasche',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
      }),
    ]);
    expect(geraet.zusatzInventarNr).toBe('AF-2.16.19');
    expect(geraet.nummer).toBe('2.16.19');
  });

  it('nimmt die Seriennummer als Flaschennummer, wenn keine Zusatz-Nr. da ist', () => {
    // Im Export tragen ältere Flaschen ihre ASSP-Nummer in der Seriennummer.
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Atemluftflasche Stahl 6 l',
        Seriennummer: '2.16.3',
        'Klasse 3': 'Atemluftflasche',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
      }),
    ]);
    expect(geraet.nummer).toBe('2.16.3');
  });

  it('überschreibt die Feuerwehr bei der Bezirksreserve', () => {
    // Im Export steht auch bei diesen Flaschen "Neusiedl am See" als
    // Dienststelle — die Bezeichnung ist die einzige Quelle.
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Atemluftflasche Stahl 6 l Bezirksreserve',
        'Klasse 3': 'Atemluftflasche',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
      }),
    ]);
    expect(geraet.feuerwehr).toBe('Bezirksreserve');
  });

  it('überspringt inaktive Artikel', () => {
    // Ein in FDISK ausgeschiedenes Gerät gehört nicht in den Bestand — es
    // stünde sonst in jeder Auswahl des Sammelplatzes.
    const geraete = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Vollatemmaske',
        'Klasse 3': 'Atemmaske',
        Dienststelle: 'Neusiedl am See',
        Status: 'inaktiv',
      }),
      row({
        Bezeichnung: 'Atemluftfüllstation Stationär',
        'Klasse 1': 'Atemlufterzeugung',
        'Klasse 2': 'Atemluftfüllstation',
        Dienststelle: 'Neusiedl am See',
        Status: 'inaktiv',
      }),
      row({
        Bezeichnung: 'Atemluftflasche CFK 6,8 l',
        'Klasse 3': 'Atemluftflasche',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
      }),
    ]);
    expect(geraete).toHaveLength(1);
    expect(geraete[0]).toMatchObject({ typ: 'flasche', active: true });
  });

  it('importiert eine Füllstation samt Standort', () => {
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        ID: '29218',
        Bezeichnung: 'Atemluftkompressor Mobil',
        'Klasse 1': 'Atemlufterzeugung',
        'Klasse 2': 'Atemluftkompressor',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
        'Hersteller/Marke': 'Drucklufttechnik Otto Nemec',
        'Herstellungs-Jahr (Baujahr)': '2016',
        Seriennummer: '2016/031',
      }),
    ]);
    expect(geraet).toMatchObject({
      externeId: '29218',
      typ: 'fuellstation',
      standort: 'mobil',
      bezeichnung: 'Atemluftkompressor Mobil',
      feuerwehr: 'Neusiedl am See',
      hersteller: 'Drucklufttechnik Otto Nemec',
      baujahr: 2016,
      seriennummer: '2016/031',
      active: true,
    });
    // Kein Nenndruck: Der gilt nur für Flaschen.
    expect(geraet.nenndruck).toBeUndefined();
  });

  it('setzt keinen Standort für Flaschen und Masken', () => {
    // "Atemluftflasche Stahl 6 l mobil" gibt es nicht, aber die Regel soll
    // nicht am Klartext hängen: Standort ist ein Feld der Füllstation.
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Vollatemmaske mobil',
        'Klasse 3': 'Atemmaske',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
      }),
    ]);
    expect(geraet.standort).toBeUndefined();
  });

  it('liest 200 bar aus der Bemerkung', () => {
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Atemluftflasche Stahl 4 l',
        'Klasse 3': 'Atemluftflasche',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
        Bemerkung: '200BAR',
      }),
    ]);
    expect(geraet.nenndruck).toBe(200);
  });

  it('setzt keinen Nenndruck für Masken und Zubehör', () => {
    const [geraet] = rowsToGeraete([
      KOPF,
      row({
        Bezeichnung: 'Vollatemmaske',
        'Klasse 3': 'Atemmaske',
        Dienststelle: 'Neusiedl am See',
        Status: 'aktiv',
      }),
    ]);
    expect(geraet.nenndruck).toBeUndefined();
  });

  it('überspringt Zeilen ohne Bezeichnung', () => {
    expect(rowsToGeraete([KOPF, row({}), row({ Bezeichnung: 'Vollatemmaske' })]))
      .toHaveLength(1);
  });

  it('wirft, wenn eine Pflichtspalte fehlt', () => {
    expect(() => rowsToGeraete([['Irgendwas', 'Anderes'], ['a', 'b']])).toThrow(
      /Bezeichnung/,
    );
  });

  it('erkennt die Spalten unabhängig von ihrer Reihenfolge', () => {
    const [geraet] = rowsToGeraete([
      ['Status', 'Dienststelle', 'Bezeichnung', 'Klasse 3'],
      ['aktiv', 'Jois', 'Vollatemmaske', 'Atemmaske'],
    ]);
    expect(geraet).toMatchObject({ feuerwehr: 'Jois', typ: 'maske' });
  });
});

describe('abgleich', () => {
  function bestand(over: Partial<AtemschutzGeraet>): AtemschutzGeraet {
    return {
      id: 'b1',
      typ: 'flasche',
      bezeichnung: 'Atemluftflasche Stahl 6 l',
      feuerwehr: 'Neusiedl am See',
      active: true,
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: '',
      ...over,
    };
  }

  it('erkennt eine bestehende Zeile über die externe ID', () => {
    const plan = abgleich(
      [{ externeId: '96176', bezeichnung: 'X', feuerwehr: 'ND', typ: 'flasche', active: true }],
      [bestand({ id: 'b1', externeId: '96176' })],
    );
    expect(plan[0]).toMatchObject({ status: 'update', existingId: 'b1', matchedBy: 'externeId' });
  });

  it('fällt auf die Inventar-Nr. zurück', () => {
    const plan = abgleich(
      [{ inventarNr: '2016-FL-038', bezeichnung: 'X', feuerwehr: 'ND', typ: 'flasche', active: true }],
      [bestand({ id: 'b2', inventarNr: '2016-FL-038' })],
    );
    expect(plan[0]).toMatchObject({ status: 'update', existingId: 'b2', matchedBy: 'inventarNr' });
  });

  it('fällt zuletzt auf die Seriennummer zurück', () => {
    const plan = abgleich(
      [{ seriennummer: 'BA66937', bezeichnung: 'X', feuerwehr: 'ND', typ: 'flasche', active: true }],
      [bestand({ id: 'b3', seriennummer: 'BA66937' })],
    );
    expect(plan[0]).toMatchObject({ status: 'update', existingId: 'b3', matchedBy: 'seriennummer' });
  });

  it('bevorzugt die externe ID vor der Inventar-Nr.', () => {
    const plan = abgleich(
      [
        {
          externeId: '96176',
          inventarNr: '2016-FL-038',
          bezeichnung: 'X',
          feuerwehr: 'ND',
          typ: 'flasche',
          active: true,
        },
      ],
      [
        bestand({ id: 'per-id', externeId: '96176' }),
        bestand({ id: 'per-inv', inventarNr: '2016-FL-038' }),
      ],
    );
    expect(plan[0].existingId).toBe('per-id');
  });

  it('meldet eine Zeile ohne Treffer als neu', () => {
    const plan = abgleich(
      [{ externeId: '999', bezeichnung: 'X', feuerwehr: 'ND', typ: 'flasche', active: true }],
      [bestand({ id: 'b1', externeId: '96176' })],
    );
    // `toMatchObject` mit `existingId: undefined` verlangte den Schlüssel;
    // eine neue Zeile trägt ihn gar nicht erst.
    expect(plan[0].status).toBe('new');
    expect(plan[0].existingId).toBeUndefined();
  });

  it('markiert Kollisionen innerhalb der Datei', () => {
    // Der Export hat 205 verschiedene IDs bei 214 Zeilen — ohne diese Meldung
    // überschreibt die zweite Zeile still die erste.
    const plan = abgleich(
      [
        { externeId: '96176', bezeichnung: 'A', feuerwehr: 'ND', typ: 'flasche', active: true },
        { externeId: '96176', bezeichnung: 'B', feuerwehr: 'ND', typ: 'flasche', active: true },
      ],
      [],
    );
    expect(plan[0].duplicateInFile).toBeFalsy();
    expect(plan[1].duplicateInFile).toBe(true);
  });

  it('meldet keine Kollision, wenn nur eine nachrangige Kennung geteilt wird', () => {
    // Im echten Export teilen sich Zeilen mit eigener FDISK-ID häufig eine
    // Seriennummer. Sie schreiben in verschiedene Dokumente und sind damit
    // keine Dublette — würden sie gemeldet, schlüge der Dialog vor, ein
    // Sechstel des Bestands zu überspringen.
    const plan = abgleich(
      [
        {
          externeId: '96176',
          seriennummer: 'BA1',
          bezeichnung: 'A',
          feuerwehr: 'ND',
          typ: 'flasche',
          active: true,
        },
        {
          externeId: '96177',
          seriennummer: 'BA1',
          bezeichnung: 'B',
          feuerwehr: 'ND',
          typ: 'flasche',
          active: true,
        },
      ],
      [],
    );
    expect(plan[0].duplicateInFile).toBeFalsy();
    expect(plan[1].duplicateInFile).toBeFalsy();
  });

  it('zählt eine Zeile ohne jede Kennung als neu und meldet sie', () => {
    const plan = abgleich(
      [{ bezeichnung: 'Vollatemmaske', feuerwehr: 'ND', typ: 'maske', active: true }],
      [],
    );
    expect(plan[0]).toMatchObject({ status: 'new', withoutIdentifier: true });
  });
});
