import { describe, expect, it } from 'vitest';
import { GROESSE_UNBEKANNT } from './bekleidung';
import {
  artikelKey,
  buildImportPlan,
  buildImportPreview,
  parseBekleidungSheet,
  type ImportDecisions,
  type ImportRow,
} from './bekleidungImport';

const BLOCK = ['ausgegeben an', 'ausgegeben an', 'ausgegeben am', 'zurück am'];
const EINSATZ_HEADER = [
  'Hersteller',
  ' Art',
  'Charge',
  'Tag Nummer',
  'Größe',
  'Status aktuell',
  'Waschgänge',
  ...BLOCK,
  ...BLOCK,
  ...BLOCK,
  ...BLOCK,
];
const DIENST_HEADER = [
  'Hersteller',
  'Artikel',
  'Charge',
  'Tag Nummer',
  'Größe',
  'Bemerkung',
  'Status aktuell',
  ...BLOCK,
  ...BLOCK,
  ...BLOCK,
  ...BLOCK,
];

/** Füllt eine Zeile auf die Breite der Kopfzeile auf. */
function pad(row: string[], width: number): string[] {
  return [...row, ...Array<string>(Math.max(0, width - row.length)).fill('')];
}

/** 45250 = 2023-11-20, 44378 = 2021-07-01, 44927 = 2023-01-01 */
const einsatzGrid: string[][] = [
  pad(['Bestandsliste Einsatzbekleidung'], EINSATZ_HEADER.length),
  EINSATZ_HEADER,
  // Zeile 3: ausgegeben, ein geschlossener und ein offener Block
  pad(
    [
      'Texport', 'Jacke', '2023', '22081702.0', 'M3', 'Ausgegeben', '12',
      'Mustermann', 'Max', '44378', '44927',
      'Musterfrau', 'Erika', '45250', '',
    ],
    EINSATZ_HEADER.length,
  ),
  // Zeile 4: privat, Lager
  pad(['Texport', 'Jacke', 'KS03', 'Eigen', '52-54 C', 'lager', '-'], EINSATZ_HEADER.length),
  // Zeile 5: leer
  pad([], EINSATZ_HEADER.length),
  // Zeile 6: Feuerwehr ohne Nummer, Reinigung, Waschgänge Text
  pad(
    ['Texport', 'Hose', 'Brand - 2021', 'Feuerwehr', '9', 'Reinigung', 'ausgeborgt'],
    EINSATZ_HEADER.length,
  ),
  // Zeile 7: nicht da, Textblock, Datum nicht bekannt
  pad(
    [
      'Texport', 'Hose', '', '', '60 III-IV', 'nicht da', '',
      'Tasche abgerissen - Kontrolle!!!', '', '', '',
      'Beispiel', 'Hans', 'nicht bekannt', '',
    ],
    EINSATZ_HEADER.length,
  ),
  // Zeile 8: vier Blöcke, alle geschlossen
  pad(
    [
      'Texport', 'Jacke', '', '30030030', 'M3', 'lager', '3',
      'A', 'Anna', '44000', '44100',
      'B', 'Bert', '44200', '44300',
      'C', 'Carl', '44400', '44500',
      'D', 'Dora', '44600', '44700',
    ],
    EINSATZ_HEADER.length,
  ),
];

const dienstGrid: string[][] = [
  DIENST_HEADER,
  pad(
    ['Fa. X', 'Poloshirt', '', '', 'm', 'Kragen fehlt', 'lager'],
    DIENST_HEADER.length,
  ),
  pad(['Fa. X', 'Poloshirt', '', '', ' M ', '', 'Lager'], DIENST_HEADER.length),
  pad(
    ['Fa. X', 'Poloshirt', '', '', 'L', '', 'ausgegeben', 'Mustermann', 'Max', '45250', ''],
    DIENST_HEADER.length,
  ),
  pad(['Fa. X', 'Poloshirt', '', '', 'L', '', 'bestellen!'], DIENST_HEADER.length),
  pad(['Fa. X', 'Poloshirt', '', '', 'L', '', 'ausgeschieden'], DIENST_HEADER.length),
];

describe('parseBekleidungSheet (Einsatz)', () => {
  const rows = parseBekleidungSheet(einsatzGrid, 'einsatz');

  it('überspringt leere Zeilen und zählt Excel-Zeilennummern', () => {
    expect(rows.map((r) => r.rowNumber)).toEqual([3, 4, 6, 7, 8]);
    expect(rows.every((r) => r.sheet === 'einsatz')).toBe(true);
  });

  it('liest Stammdaten, Tag-Nummer und normalisierten Status', () => {
    expect(rows[0]).toMatchObject({
      hersteller: 'Texport',
      art: 'Jacke',
      charge: '2023',
      tagNummer: '22081702',
      eigentum: 'feuerwehr',
      groesse: 'M3',
      status: 'ausgegeben',
      waschgaengeAltbestand: 12,
      bemerkungen: [],
    });
  });

  it('liest die Ausgabeblöcke mit Datum', () => {
    expect(rows[0].ausgaben).toEqual([
      {
        nachname: 'Mustermann',
        vorname: 'Max',
        ausgegebenAm: '2021-07-01',
        zurueckAm: '2023-01-01',
        datumUnbekannt: false,
      },
      {
        nachname: 'Musterfrau',
        vorname: 'Erika',
        ausgegebenAm: '2023-11-20',
        zurueckAm: undefined,
        datumUnbekannt: false,
      },
    ]);
  });

  it('„Eigen" heißt privat ohne Tag-Nummer, „-" heißt 0 Waschgänge', () => {
    expect(rows[1]).toMatchObject({
      tagNummer: undefined,
      eigentum: 'privat',
      status: 'lager',
      waschgaengeAltbestand: 0,
      charge: 'KS03',
    });
  });

  it('„Feuerwehr" heißt ohne Tag-Nummer, Reinigung → Lager mit Bemerkung', () => {
    expect(rows[2]).toMatchObject({
      tagNummer: undefined,
      eigentum: 'feuerwehr',
      status: 'lager',
      waschgaengeAltbestand: 0,
      charge: 'Brand - 2021',
    });
    expect(rows[2].bemerkungen).toEqual([
      'Status im Excel: Reinigung',
      'Waschgänge: ausgeborgt',
    ]);
  });

  it('„nicht da", Textblock als Bemerkung, „nicht bekannt" als Datum', () => {
    expect(rows[3].status).toBe('nicht_auffindbar');
    expect(rows[3].bemerkungen).toEqual(['Tasche abgerissen - Kontrolle!!!']);
    expect(rows[3].ausgaben).toEqual([
      {
        nachname: 'Beispiel',
        vorname: 'Hans',
        ausgegebenAm: undefined,
        zurueckAm: undefined,
        datumUnbekannt: true,
      },
    ]);
  });

  it('liest vier Blöcke', () => {
    expect(rows[4].ausgaben.map((a) => a.vorname)).toEqual(['Anna', 'Bert', 'Carl', 'Dora']);
    expect(rows[4].ausgaben.every((a) => a.zurueckAm)).toBe(true);
  });
});

describe('parseBekleidungSheet (Eigenheiten der echten Datei)', () => {
  const grid = [
    EINSATZ_HEADER,
    // Zahlen in E-Schreibweise, Größe und Charge als Kommazahl
    pad(['Texport', 'Jacke', '2020.0', '2.2081702E7', '6.0', 'lager', '12.0'], EINSATZ_HEADER.length),
    // alphanumerische Tag-Nummern
    pad(['Texport', 'Jacke', '', '189WFI1200003', 'M3', 'lager'], EINSATZ_HEADER.length),
    pad(['Texport', 'Jacke', '', '7E97510003180001', 'M3', 'lager'], EINSATZ_HEADER.length),
    // Text in der Tag-Spalte ist keine Nummer
    pad(['Fa. X', 'Hemd', '', 'Alter Druck', 'M', 'lager'], EINSATZ_HEADER.length),
    // nur ein Jahr bzw. ein Tippfehler als Datum, zurück ohne Namen
    pad(
      [
        'Fa. X', 'Hemd', '', '', 'M', 'ausgegeben', '',
        'Mustermann', 'Max', '2020.0', '',
        'Musterfrau', 'Erika', '11.09.0263', '01.02.2024',
        '', '', '', '44927.0',
      ],
      EINSATZ_HEADER.length,
    ),
    // Rückgabe als Text: der Block gilt als geschlossen
    pad(
      ['Fa. X', 'Hemd', '', '', 'M', 'lager', '', 'Beispiel', 'Hans', 'unbekannt', 'Rep. 05/26'],
      EINSATZ_HEADER.length,
    ),
  ];
  const rows = parseBekleidungSheet(grid, 'einsatz');

  it('wandelt Zahlen in E-Schreibweise und Kommazahlen in Ganzzahltext', () => {
    expect(rows[0]).toMatchObject({
      tagNummer: '22081702',
      groesse: '6',
      charge: '2020',
      waschgaengeAltbestand: 12,
    });
  });

  it('übernimmt alphanumerische Tag-Nummern', () => {
    expect(rows[1].tagNummer).toBe('189WFI1200003');
    expect(rows[2].tagNummer).toBe('7E97510003180001');
  });

  it('macht Text in der Tag-Spalte zur Bemerkung', () => {
    expect(rows[3].tagNummer).toBeUndefined();
    expect(rows[3].bemerkungen).toEqual(['Tag Nummer im Excel: Alter Druck']);
  });

  it('liest unplausible Daten als unbekannt und vermerkt sie', () => {
    expect(rows[4].ausgaben).toEqual([
      expect.objectContaining({ vorname: 'Max', datumUnbekannt: true }),
      expect.objectContaining({ vorname: 'Erika', datumUnbekannt: true, zurueckAm: '2024-02-01' }),
    ]);
    expect(rows[4].ausgaben[0].ausgegebenAm).toBeUndefined();
    expect(rows[4].ausgaben[1].ausgegebenAm).toBeUndefined();
    expect(rows[4].bemerkungen).toEqual([
      'ausgegeben am im Excel: 2020',
      'ausgegeben am im Excel: 11.09.0263',
      'Ausgabe ohne Namen: zurück am 2023-01-01',
    ]);
  });

  it('wertet eine Rückgabe als Text als geschlossen', () => {
    expect(rows[5].ausgaben).toHaveLength(1);
    expect(rows[5].ausgaben[0].zurueckAm).toBeTruthy();
    expect(rows[5].ausgaben[0].datumUnbekannt).toBe(true);
    expect(rows[5].bemerkungen).toEqual(['zurück am im Excel: Rep. 05/26']);
    const preview = buildImportPreview(rows.slice(5), [], []);
    expect(preview.statusConflicts).toEqual([]);
    const plan = buildImportPlan(
      preview,
      { fuehrung: {}, persons: { 'hans beispiel': { create: 'Hans Beispiel' } } },
      '2026-10-08',
    );
    expect(plan.ausgaben[0].zurueckAm).toBe('2026-10-08');
  });
});

describe('parseBekleidungSheet (Dienst)', () => {
  const rows = parseBekleidungSheet(dienstGrid, 'dienst');

  it('liest die Bemerkungsspalte und Artikel statt Art', () => {
    expect(rows[0]).toMatchObject({
      sheet: 'dienst',
      rowNumber: 2,
      art: 'Poloshirt',
      hersteller: 'Fa. X',
      waschgaengeAltbestand: 0,
      bemerkungen: ['Kragen fehlt'],
    });
  });

  it('ordnet „bestellen!" dem Lager zu und vermerkt es', () => {
    expect(rows[3].status).toBe('lager');
    expect(rows[3].bemerkungen).toEqual(['Status im Excel: bestellen!']);
  });

  it('wirft, wenn Pflichtspalten fehlen', () => {
    expect(() => parseBekleidungSheet([['Hersteller', 'Tag Nummer']], 'dienst')).toThrow(
      /Größe/,
    );
    expect(() => parseBekleidungSheet([['nichts']], 'dienst')).toThrow(/Tag Nummer/);
  });
});

describe('artikelKey', () => {
  it('normalisiert Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(artikelKey('einsatz', '  Jacke  Lang ', 'TEXPORT')).toBe('einsatz|jacke lang|texport');
    expect(artikelKey('dienst', 'Polo', '')).toBe('dienst|polo|');
  });
});

const persons = [
  { id: 'p-max', name: 'Max Mustermann' },
  { id: 'p-erika', name: 'Musterfrau Erika' },
];

describe('buildImportPreview', () => {
  const einsatz = parseBekleidungSheet(einsatzGrid, 'einsatz');
  const dienst = parseBekleidungSheet(dienstGrid, 'dienst');
  const preview = buildImportPreview(einsatz, dienst, persons);

  it('schlägt die Führung vor: einzeln mit Tag-Nummer, sonst menge', () => {
    const byKey = Object.fromEntries(preview.artikel.map((a) => [a.key, a]));
    expect(byKey['einsatz|jacke|texport']).toMatchObject({
      fuehrung: 'einzeln',
      bezeichnung: 'Jacke',
      hersteller: 'Texport',
      rowCount: 3,
    });
    expect(byKey['einsatz|hose|texport'].fuehrung).toBe('menge');
    expect(byKey['dienst|poloshirt|fa. x']).toMatchObject({ fuehrung: 'menge', rowCount: 5 });
  });

  it('dedupliziert Personen und gleicht sie ab', () => {
    const byKey = Object.fromEntries(preview.persons.map((p) => [p.key, p]));
    expect(preview.persons.filter((p) => p.key === 'max mustermann')).toHaveLength(1);
    expect(byKey['max mustermann'].match).toMatchObject({ status: 'matched', personId: 'p-max' });
    expect(byKey['erika musterfrau'].match).toMatchObject({ status: 'matched', personId: 'p-erika' });
    expect(byKey['hans beispiel'].match.status).toBe('new');
    // Textblock ist keine Person
    expect(preview.persons.some((p) => p.nachname.startsWith('Tasche'))).toBe(false);
  });

  it('listet doppelte Tag-Nummern über beide Blätter', () => {
    const extra: ImportRow = { ...einsatz[0], sheet: 'dienst', rowNumber: 99, ausgaben: [] };
    const withDup = buildImportPreview(einsatz, [extra], persons);
    expect(withDup.duplicateTags).toEqual([
      {
        tagNummer: '22081702',
        rowNumbers: [
          { sheet: 'einsatz', rowNumber: 3 },
          { sheet: 'dienst', rowNumber: 99 },
        ],
      },
    ]);
    expect(preview.duplicateTags).toEqual([]);
  });

  it('meldet Widersprüche zwischen Status und offenen Blöcken', () => {
    expect(preview.statusConflicts.map((c) => `${c.sheet}:${c.rowNumber}`)).toEqual([
      // nicht da, aber offener Block
      'einsatz:7',
    ]);
    const conflict = buildImportPreview(
      [{ ...einsatz[0], ausgaben: [einsatz[0].ausgaben[0]] }],
      [],
      persons,
    );
    expect(conflict.statusConflicts).toHaveLength(1);
    expect(conflict.statusConflicts[0].message).toMatch(/keine offene Ausgabe/);
  });
});

describe('buildImportPlan', () => {
  const einsatz = parseBekleidungSheet(einsatzGrid, 'einsatz');
  const dienst = parseBekleidungSheet(dienstGrid, 'dienst');
  const preview = buildImportPreview(einsatz, dienst, persons);
  const decisions: ImportDecisions = {
    fuehrung: {},
    persons: Object.fromEntries(
      preview.persons.map((p) => [
        p.key,
        p.match.personId
          ? { personId: p.match.personId }
          : { create: `${p.vorname} ${p.nachname}` },
      ]),
    ),
  };
  const today = '2026-10-08';
  const plan = buildImportPlan(preview, decisions, today);

  it('übernimmt die Artikel mit vorgeschlagener oder gewählter Führung', () => {
    expect(plan.artikel.map((a) => [a.key, a.fuehrung])).toEqual(
      expect.arrayContaining([
        ['einsatz|jacke|texport', 'einzeln'],
        ['einsatz|hose|texport', 'menge'],
        ['dienst|poloshirt|fa. x', 'menge'],
      ]),
    );
    expect(plan.artikel.every((a) => a.aktiv)).toBe(true);
    const switched = buildImportPlan(
      preview,
      { ...decisions, fuehrung: { 'einsatz|hose|texport': 'einzeln' } },
      today,
    );
    expect(switched.stuecke.filter((s) => s.artikelKey === 'einsatz|hose|texport')).toHaveLength(2);
  });

  it('legt nur neu zu erstellende, verwendete Personen an', () => {
    expect(plan.personsToCreate).toEqual(
      expect.arrayContaining([{ key: 'hans beispiel', name: 'Hans Beispiel' }]),
    );
    expect(plan.personsToCreate.some((p) => p.key === 'max mustermann')).toBe(false);
  });

  it('erzeugt je Zeile eines Einzelartikels ein Stück, auch private', () => {
    const jacken = plan.stuecke.filter((s) => s.artikelKey === 'einsatz|jacke|texport');
    expect(jacken).toHaveLength(3);
    expect(jacken[1]).toMatchObject({ eigentum: 'privat', status: 'lager', groesse: '52-54 C' });
  });

  it('ein offener Block macht das Stück ausgegeben, geschlossene bleiben Historie', () => {
    const stueck = plan.stuecke.find((s) => s.tagNummer === '22081702')!;
    expect(stueck).toMatchObject({
      status: 'ausgegeben',
      personKey: 'erika musterfrau',
      ausgegebenAm: '2023-11-20',
      waschgaengeAltbestand: 12,
      waschgaenge: 0,
    });
    const ausgaben = plan.ausgaben.filter((a) => a.stueckTempId === stueck.tempId);
    expect(ausgaben).toEqual([
      expect.objectContaining({
        personKey: 'max mustermann',
        ausgegebenAm: '2021-07-01',
        zurueckAm: '2023-01-01',
        menge: 1,
        quelle: 'import',
      }),
      expect.objectContaining({ personKey: 'erika musterfrau' }),
    ]);
    expect(ausgaben[1].zurueckAm).toBeUndefined();
  });

  it('Mengenartikel: Lagerzeilen je normalisierter Größe zusammengezählt', () => {
    const polos = plan.bestand.filter((b) => b.artikelKey === 'dienst|poloshirt|fa. x');
    expect(polos).toEqual(
      expect.arrayContaining([
        { artikelKey: 'dienst|poloshirt|fa. x', groesse: 'M', anzahl: 2 },
        // bestellen! → lager
        { artikelKey: 'dienst|poloshirt|fa. x', groesse: 'L', anzahl: 1 },
      ]),
    );
    expect(polos).toHaveLength(2);
    expect(plan.stuecke.some((s) => s.artikelKey === 'dienst|poloshirt|fa. x')).toBe(false);
  });

  it('Mengenartikel: jeder Block wird eine Ausgabe mit Menge 1', () => {
    const polo = plan.ausgaben.filter((a) => a.artikelKey === 'dienst|poloshirt|fa. x');
    expect(polo).toEqual([
      expect.objectContaining({
        personKey: 'max mustermann',
        groesse: 'L',
        menge: 1,
        ausgegebenAm: '2023-11-20',
      }),
    ]);
    expect(polo[0].zurueckAm).toBeUndefined();
    expect(polo[0].stueckTempId).toBeUndefined();
  });

  it('schließt einen offenen Block mit dem Importdatum, wenn das Stück nicht ausgegeben ist', () => {
    const hose = plan.ausgaben.filter((a) => a.personKey === 'hans beispiel');
    expect(hose).toHaveLength(1);
    expect(hose[0].zurueckAm).toBe(today);
    expect(hose[0].ausgegebenAm).toBeUndefined();
  });

  it('Status ausgegeben ohne offenen Block: Status bleibt, keine Person', () => {
    const conflictPreview = buildImportPreview(
      [{ ...einsatz[0], ausgaben: [einsatz[0].ausgaben[0]] }],
      [],
      persons,
    );
    const p = buildImportPlan(
      conflictPreview,
      { fuehrung: {}, persons: { 'max mustermann': { personId: 'p-max' } } },
      today,
    );
    expect(p.stuecke[0].status).toBe('ausgegeben');
    expect(p.stuecke[0].personKey).toBeUndefined();
  });

  it('doppelte Tag-Nummer: das erste Stück behält sie, weitere bekommen eine Bemerkung', () => {
    const dup: ImportRow = {
      ...einsatz[4],
      sheet: 'einsatz',
      rowNumber: 50,
      tagNummer: '22081702',
      ausgaben: [],
    };
    const dupPreview = buildImportPreview([einsatz[0], dup], [], persons);
    const p = buildImportPlan(
      dupPreview,
      {
        fuehrung: {},
        persons: {
          'max mustermann': { personId: 'p-max' },
          'erika musterfrau': { personId: 'p-erika' },
        },
      },
      today,
    );
    expect(p.stuecke[0].tagNummer).toBe('22081702');
    expect(p.stuecke[1].tagNummer).toBeUndefined();
    expect(p.stuecke[1].bemerkung).toBe('Tag-Nummer doppelt: 22081702');
  });

  it('fügt Bemerkungen mit "; " zusammen', () => {
    const hose = plan.stuecke.find((s) => s.artikelKey === 'einsatz|hose|texport');
    expect(hose).toBeUndefined(); // Hose ist ein Mengenartikel
    const switched = buildImportPlan(
      preview,
      { ...decisions, fuehrung: { 'einsatz|hose|texport': 'einzeln' } },
      today,
    );
    const first = switched.stuecke.find((s) => s.artikelKey === 'einsatz|hose|texport')!;
    expect(first.bemerkung).toBe('Status im Excel: Reinigung; Waschgänge: ausgeborgt');
  });

  it('wirft, wenn für eine verwendete Person keine Entscheidung vorliegt', () => {
    expect(() => buildImportPlan(preview, { fuehrung: {}, persons: {} }, today)).toThrow(
      /Person/,
    );
  });
});

describe('Review-Nachträge', () => {
  it('leere Größe wird zum Platzhalter „–", Vorschau und Plan bleiben lauffähig', () => {
    const grid = [
      DIENST_HEADER,
      pad(['Fa. X', 'Poloshirt', '', '', '', '', 'lager'], DIENST_HEADER.length),
      pad(['Fa. X', 'Poloshirt', '', '', '  ', '', 'lager'], DIENST_HEADER.length),
    ];
    const rows = parseBekleidungSheet(grid, 'dienst');
    expect(GROESSE_UNBEKANNT).toBe('\u2013');
    expect(rows.map((r) => r.groesse)).toEqual([GROESSE_UNBEKANNT, GROESSE_UNBEKANNT]);
    const preview = buildImportPreview([], rows, []);
    const plan = buildImportPlan(preview, { fuehrung: {}, persons: {} }, '2026-10-08');
    expect(plan.bestand).toEqual([
      { artikelKey: 'dienst|poloshirt|fa. x', groesse: GROESSE_UNBEKANNT, anzahl: 2 },
    ]);
  });

  it('liest ISO-Datum mit Uhrzeit (xlsx) als Kalenderdatum', () => {
    const grid = [
      DIENST_HEADER,
      pad(
        ['Fa. X', 'Poloshirt', '', '', 'L', '', 'ausgegeben', 'Mustermann', 'Max', '2023-11-20T00:00:00.000Z', ''],
        DIENST_HEADER.length,
      ),
    ];
    const [row] = parseBekleidungSheet(grid, 'dienst');
    expect(row.ausgaben[0].ausgegebenAm).toBe('2023-11-20');
    expect(row.ausgaben[0].datumUnbekannt).toBe(false);
    expect(row.bemerkungen).toEqual([]);
  });

  it('private Zeilen eines Mengenartikels: Ausgabe als privat markiert, kein Bestand', () => {
    const grid = [
      DIENST_HEADER,
      pad(
        ['Fa. X', 'Poloshirt', '', 'Eigen', 'L', '', 'ausgegeben', 'Mustermann', 'Max', '45250', ''],
        DIENST_HEADER.length,
      ),
      pad(['Fa. X', 'Poloshirt', '', '', 'L', '', 'ausgegeben', 'Mustermann', 'Max', '45250', ''], DIENST_HEADER.length),
      pad(['Fa. X', 'Poloshirt', '', 'Eigen', 'L', '', 'lager'], DIENST_HEADER.length),
    ];
    const rows = parseBekleidungSheet(grid, 'dienst');
    const preview = buildImportPreview([], rows, []);
    const plan = buildImportPlan(
      preview,
      { fuehrung: {}, persons: { 'max mustermann': { personId: 'p-max' } } },
      '2026-10-08',
    );
    expect(plan.ausgaben).toHaveLength(2);
    expect(plan.ausgaben[0].eigentum).toBe('privat');
    expect(plan.ausgaben[1].eigentum).toBeUndefined();
    expect(plan.bestand).toEqual([]);
  });
});
