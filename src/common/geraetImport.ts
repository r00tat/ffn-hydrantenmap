import { parseBarcodes } from './atemschutzImport';
import {
  GERAET_MATERIAL_TYPEN,
  type Geraet,
  type GeraetBestand,
  type GeraetEinheitVerwendungsnachweis,
  type GeraetLagerort,
  type GeraetMaterialTyp,
  lagerortKey,
} from './geraet';

/**
 * Import der Geräte und Lagerartikel aus dem Sybos-Artikelexport (XLSX).
 *
 * Anders als beim Atemschutz steht im Export **eine Zeile je Artikel und
 * Lagerort**: Dieselbe `ID` kommt mehrfach vor, jeweils mit eigener
 * `Anzahl` (Geräte-Export: 1106 Zeilen, 765 IDs). Die Zeilen werden deshalb
 * nach `ID` zu Artikeln gruppiert, je Zeile entsteht ein Bestand.
 *
 * Gelesen wird ein Raster aus Strings — die XLSX-Datei liest der Aufrufer
 * mit `readXlsxSheet` aus `xlsx.ts`.
 */

/**
 * Höchstgröße der Exportdatei. Sie geht als Base64 im Rumpf einer Server
 * Action hinaus, und Next.js nimmt davon höchstens 1 MB an
 * (`serverActions.bodySizeLimit`, hier nicht erhöht). Base64 macht die Datei
 * um ein Drittel größer; 700 000 Bytes werden zu gut 930 kB und lassen Platz
 * für die übrigen Argumente (die Liste der übernommenen Abweichungen). Der
 * Geräte-Export mit 1106 Zeilen ist weit kleiner.
 *
 * Der Dialog prüft die Größe vor dem Senden — eine größere Datei scheiterte
 * sonst mit einem nichtssagenden Fehler des Frameworks.
 */
export const GERAET_IMPORT_MAX_BYTES = 700_000;

/** Die Spaltennamen des Exports. Erkannt wird über die Kopfzeile. */
export const GERAET_EXPORT_COLUMNS = {
  externeId: 'ID',
  bezeichnung: 'Bezeichnung',
  inventarNr: 'Inventar-Nr.',
  zusatzInventarNr: 'Zusatz-Inventar-Nr.',
  barcodes: 'Barcodes',
  kategorie: 'Kategorie',
  klasse1: 'Klasse 1',
  klasse2: 'Klasse 2',
  klasse3: 'Klasse 3',
  materialTyp: 'Material-Typ',
  hersteller: 'Hersteller/Marke',
  herstellerTyp: 'Hersteller-Typen Bezeichnung',
  baujahr: 'Herstellungs-Jahr (Baujahr)',
  seriennummer: 'Seriennummer',
  bemerkung: 'Bemerkung',
  besitzer: 'Besitzer',
  vorlage: 'Vorlage',
  zubehoer: 'Zubehör',
  anschaffungsDatum: 'Anschaffungs-Datum',
  verfuegbarBis: 'Verfügbar bis',
  lebensdauer: 'Lebensdauer',
  /** Einheit der Lebensdauer — nicht die Zähleinheit des Artikels. */
  lebensdauerEinheit: 'Einheit',
  status: 'Status',
  einheitVerwendungsnachweis: 'Einheit Verwendungsnachweis',
  lagerort: 'Lagerort',
  fahrzeug: 'Fahrzeug-Name',
  laderaum: 'Laderaum',
  standort: 'Standort',
  raum: 'Raum',
  anzahl: 'Anzahl',
  lagerortBemerkung: 'Lagerort-Bemerkung',
} as const;

/** Ohne ID lässt sich nicht gruppieren, ohne Bezeichnung nichts erkennen. */
const REQUIRED_COLUMNS = [
  GERAET_EXPORT_COLUMNS.externeId,
  GERAET_EXPORT_COLUMNS.bezeichnung,
];

/** Wie beim Atemschutz-Import: nur „inaktiv" zählt als inaktiv. */
const STATUS_INACTIVE = 'inaktiv';

/** Die Werte der Spalte „Lagerort" auf die Art des Lagerorts. */
const LAGERORT_ART: Record<string, GeraetLagerort['art']> = {
  fahrzeug: 'fahrzeug',
  raum: 'raum',
  'set-artikel': 'set',
};

/** Die Felder, die der Import an einem Artikel setzt. */
export const GERAET_IMPORT_FIELDS = [
  'externeId',
  'bezeichnung',
  'inventarNr',
  'zusatzInventarNr',
  'barcodes',
  'kategorie',
  'klasse1',
  'klasse2',
  'klasse3',
  'materialTyp',
  'hersteller',
  'herstellerTyp',
  'baujahr',
  'seriennummer',
  'bemerkung',
  'besitzer',
  'vorlage',
  'zubehoer',
  'anschaffungsDatum',
  'verfuegbarBis',
  'lebensdauer',
  'lebensdauerEinheit',
  'einheitVerwendungsnachweis',
  'active',
] as const satisfies readonly (keyof Geraet)[];

export type GeraetImportField = (typeof GERAET_IMPORT_FIELDS)[number];

/**
 * Stammdaten aus dem Export. Händisch gepflegte Felder (Verbrauchsmaterial,
 * Mindestbestand, Einheit, Kostenersatz) fehlen bewusst — ein Folgeimport
 * darf sie nicht überschreiben. Leere Felder fehlen ganz statt `undefined`
 * zu tragen, das lehnt Firestore ab.
 */
export type GeraetImportStammdaten = Pick<Geraet, 'bezeichnung' | 'active'> &
  Partial<Pick<Geraet, GeraetImportField>>;

export interface ParsedGeraetBestand {
  lagerort: GeraetLagerort;
  lagerortKey: string;
  anzahl: number;
}

export interface ParsedGeraet {
  externeId: string;
  stammdaten: GeraetImportStammdaten;
  bestaende: ParsedGeraetBestand[];
  /**
   * Vorschlag für `verbrauchsmaterial` beim **Erstimport** aus der Kategorie.
   * Danach wird das Flag nur noch von Hand gepflegt.
   */
  suggestedConsumable: boolean;
}

export interface ParsedGeraetExport {
  artikel: ParsedGeraet[];
  /**
   * Trägt die Datei die Spalte „Lagerort"? Sybos lässt sich auch ohne die
   * Lagerort-Spalten exportieren — dann sagt die Datei über den Bestand
   * nichts, und ein fehlender Lagerort heißt nicht „dort liegt nichts mehr".
   */
  withBestand: boolean;
  /** Meldungen auf Deutsch, je Zeile mit ihrer Nummer in der Tabelle. */
  errors: string[];
}

/**
 * Ist die Kategorie eine für Verbrauchsmaterial?
 *
 * Der Geräte-Export trägt durchgehend „Gerät". Welchen Wert der
 * Lagerartikel-Export hat, ist noch offen; angenommen werden die naheliegenden
 * Bezeichnungen. Es ist nur ein Vorschlag — im Artikel jederzeit änderbar.
 */
export function suggestConsumable(kategorie?: string): boolean {
  return /verbrauch|lagerartikel/i.test(kategorie ?? '');
}

/** Tag 0 der Excel-Seriennummern (mit dem Schaltjahrfehler von 1900). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ein Datum aus dem Export als `YYYY-MM-DD`. Die XLSX-Datei trägt Datumswerte
 * als Seriennummer („45250", auch mit Uhrzeit als Bruchteil); ein bereits
 * als Text geschriebenes ISO-Datum wird ebenso angenommen. Unlesbares:
 * `undefined`.
 */
export function parseExportDate(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (iso) return iso[1];
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  const serial = Math.floor(Number(v));
  // Vor 1950 oder nach 2200 ist es keine Seriennummer eines Datums.
  if (serial < 18264 || serial > 109574) return undefined;
  return new Date(EXCEL_EPOCH_MS + serial * DAY_MS).toISOString().slice(0, 10);
}

function parseMaterialTyp(value: string): GeraetMaterialTyp | undefined {
  return GERAET_MATERIAL_TYPEN.find(
    (t) => t.toLowerCase() === value.toLowerCase(),
  );
}

function parseEinheit(value: string): GeraetEinheitVerwendungsnachweis | undefined {
  const v = value.toLowerCase();
  return v === 'stk' || v === 'h' ? v : undefined;
}

/** „2", „2,5" oder „2.5" — `undefined` bei leerer Zelle, `NaN` bei Unlesbarem. */
function parseNumber(value: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/**
 * Wandelt das Raster (Kopfzeile plus Datenzeilen) in Artikel mit Beständen.
 *
 * Die Stammdaten kommen aus der ersten Zeile einer ID — im Export sind sie in
 * allen Zeilen derselben ID gleich. Völlig leere Zeilen werden still
 * übersprungen (der Export endet je nach Ausgabeweg mit solchen), alles andere,
 * was nicht passt, landet in `errors`.
 */
export function parseGeraetExport(rows: string[][]): ParsedGeraetExport {
  const errors: string[] = [];
  if (rows.length === 0) return { artikel: [], errors, withBestand: true };

  const index = new Map<string, number>();
  rows[0].forEach((name, i) => index.set((name ?? '').trim(), i));
  const missing = REQUIRED_COLUMNS.filter((name) => !index.has(name));
  if (missing.length > 0) {
    return {
      artikel: [],
      errors: [`Spalte(n) nicht gefunden: ${missing.join(', ')}`],
      withBestand: true,
    };
  }
  const withBestand = index.has(GERAET_EXPORT_COLUMNS.lagerort);
  if (!withBestand) {
    errors.push(
      'Datei ohne Lagerort-Spalten: Es werden nur Stammdaten übernommen, der Bestand bleibt unverändert.',
    );
  }

  const cell = (row: string[], column: string): string =>
    (row[index.get(column) ?? -1] ?? '').trim();

  const byId = new Map<string, ParsedGeraet>();
  rows.slice(1).forEach((row, i) => {
    // Zeilennummer wie in der Tabellenkalkulation: Kopfzeile ist Zeile 1.
    const line = i + 2;
    if (row.every((v) => !(v ?? '').trim())) return;

    const externeId = cell(row, GERAET_EXPORT_COLUMNS.externeId);
    const bezeichnung = cell(row, GERAET_EXPORT_COLUMNS.bezeichnung);
    if (!externeId) {
      errors.push(`Zeile ${line}: keine ID${bezeichnung ? ` („${bezeichnung}")` : ''}`);
      return;
    }
    if (!bezeichnung && !byId.has(externeId)) {
      errors.push(`Zeile ${line}: keine Bezeichnung (ID ${externeId})`);
      return;
    }

    let artikel = byId.get(externeId);
    if (!artikel) {
      const kategorie = cell(row, GERAET_EXPORT_COLUMNS.kategorie);
      artikel = {
        externeId,
        stammdaten: buildStammdaten(row, cell, externeId, bezeichnung),
        bestaende: [],
        suggestedConsumable: suggestConsumable(kategorie),
      };
      byId.set(externeId, artikel);
    }

    const bestand = buildBestand(row, cell, line, artikel, errors);
    if (!bestand) return;

    const existing = artikel.bestaende.find(
      (b) => b.lagerortKey === bestand.lagerortKey,
    );
    if (existing) {
      // Zweimal derselbe Lagerort: Die Anzahlen gehören zusammen, sonst
      // überschriebe die zweite Zeile die erste.
      existing.anzahl += bestand.anzahl;
      errors.push(
        `Zeile ${line}: Lagerort doppelt bei ID ${externeId} — Anzahlen zusammengezählt`,
      );
      return;
    }
    artikel.bestaende.push(bestand);
  });

  return { artikel: [...byId.values()], errors, withBestand };
}

type CellReader = (row: string[], column: string) => string;

function buildStammdaten(
  row: string[],
  cell: CellReader,
  externeId: string,
  bezeichnung: string,
): GeraetImportStammdaten {
  const c = GERAET_EXPORT_COLUMNS;
  const stammdaten: GeraetImportStammdaten = {
    externeId,
    bezeichnung,
    active: cell(row, c.status).toLowerCase() !== STATUS_INACTIVE,
  };

  const text = [
    ['inventarNr', c.inventarNr],
    ['zusatzInventarNr', c.zusatzInventarNr],
    ['kategorie', c.kategorie],
    ['klasse1', c.klasse1],
    ['klasse2', c.klasse2],
    ['klasse3', c.klasse3],
    ['hersteller', c.hersteller],
    ['herstellerTyp', c.herstellerTyp],
    ['seriennummer', c.seriennummer],
    ['bemerkung', c.bemerkung],
    ['besitzer', c.besitzer],
    ['vorlage', c.vorlage],
    ['zubehoer', c.zubehoer],
  ] as const;
  for (const [field, column] of text) {
    const value = cell(row, column);
    if (value) stammdaten[field] = value;
  }

  const barcodes = parseBarcodes(cell(row, c.barcodes));
  if (barcodes.length > 0) stammdaten.barcodes = barcodes;

  const materialTyp = parseMaterialTyp(cell(row, c.materialTyp));
  if (materialTyp) stammdaten.materialTyp = materialTyp;

  const einheit = parseEinheit(cell(row, c.einheitVerwendungsnachweis));
  if (einheit) stammdaten.einheitVerwendungsnachweis = einheit;

  const baujahr = Number(cell(row, c.baujahr));
  if (Number.isInteger(baujahr) && baujahr > 1900) stammdaten.baujahr = baujahr;

  const anschaffungsDatum = parseExportDate(cell(row, c.anschaffungsDatum));
  if (anschaffungsDatum) stammdaten.anschaffungsDatum = anschaffungsDatum;
  const verfuegbarBis = parseExportDate(cell(row, c.verfuegbarBis));
  if (verfuegbarBis) stammdaten.verfuegbarBis = verfuegbarBis;

  // Die Einheit steht in jeder Zeile („Monat(e)"), zählt aber nur zusammen
  // mit einer Lebensdauer.
  const lebensdauer = parseNumber(cell(row, c.lebensdauer));
  if (lebensdauer !== undefined && Number.isFinite(lebensdauer) && lebensdauer > 0) {
    stammdaten.lebensdauer = lebensdauer;
    const lebensdauerEinheit = cell(row, c.lebensdauerEinheit);
    if (lebensdauerEinheit) stammdaten.lebensdauerEinheit = lebensdauerEinheit;
  }

  return stammdaten;
}

function buildBestand(
  row: string[],
  cell: CellReader,
  line: number,
  artikel: ParsedGeraet,
  errors: string[],
): ParsedGeraetBestand | undefined {
  const c = GERAET_EXPORT_COLUMNS;
  const rawArt = cell(row, c.lagerort);
  // Ohne Lagerort steht der Artikel nirgends — er wird ohne Bestand angelegt.
  if (!rawArt) return undefined;

  const art = LAGERORT_ART[rawArt.toLowerCase()];
  if (!art) {
    errors.push(`Zeile ${line}: unbekannter Lagerort „${rawArt}" (ID ${artikel.externeId})`);
    return undefined;
  }

  const lagerort: GeraetLagerort = { art };
  const set = (field: keyof GeraetLagerort, column: string) => {
    const value = cell(row, column);
    if (value) (lagerort as unknown as Record<string, string>)[field] = value;
  };
  if (art === 'fahrzeug') {
    set('fahrzeug', c.fahrzeug);
    set('laderaum', c.laderaum);
  } else if (art === 'raum') {
    set('standort', c.standort);
    set('raum', c.raum);
  }
  set('bemerkung', c.lagerortBemerkung);

  const rawAnzahl = cell(row, c.anzahl);
  const parsed = parseNumber(rawAnzahl);
  let anzahl: number;
  if (parsed === undefined) {
    // Ein Einzelartikel ist immer genau ein Stück.
    anzahl = artikel.stammdaten.materialTyp === 'Einzelartikel' ? 1 : 0;
  } else if (Number.isNaN(parsed)) {
    errors.push(
      `Zeile ${line}: Anzahl „${rawAnzahl}" nicht lesbar (ID ${artikel.externeId}) — als 0 übernommen`,
    );
    anzahl = 0;
  } else {
    anzahl = parsed;
  }

  return { lagerort, lagerortKey: lagerortKey(lagerort), anzahl };
}

// --- Abgleich ----------------------------------------------------------------

export interface GeraetImportUpdate {
  geraetId: string;
  stammdaten: GeraetImportStammdaten;
  /** Felder, deren Wert sich ändert oder neu hinzukommt. */
  changedFields: GeraetImportField[];
  /** Felder, die in Sybos geleert wurden — am Artikel zu löschen. */
  removedFields: GeraetImportField[];
}

export interface GeraetImportBestandCreate {
  /** Bei neuen Artikeln die Sybos-ID — sie wird zur Dokument-ID. */
  geraetId: string;
  lagerort: GeraetLagerort;
  lagerortKey: string;
  anzahl: number;
}

export interface GeraetImportBestandRef {
  geraetId: string;
  bestandId: string;
  lagerortKey: string;
}

export interface GeraetImportBestandChange {
  geraetId: string;
  /** Fehlt bei einem neuen Lagerort eines Artikels mit Buchungen. */
  bestandId?: string;
  lagerortKey: string;
  current: number;
  imported: number;
}

/** Serialisierbar — geht als Vorschau über die Server Action zum Client. */
export interface GeraetImportPlan {
  /** Neue Artikel; Dokument-ID = `externeId`. */
  create: ParsedGeraet[];
  /** Vorhandene Artikel mit geänderten Stammdaten. */
  update: GeraetImportUpdate[];
  /** IDs vorhandener Artikel ohne Änderung an den Stammdaten. */
  unchanged: string[];
  /** Neu anzulegende Bestände (Buchung `import`), auch die neuer Artikel. */
  bestandCreate: GeraetImportBestandCreate[];
  /** Bestände, deren Anzahl mit der Datei übereinstimmt. */
  bestandUnchanged: GeraetImportBestandRef[];
  /**
   * Geänderte Bestände ohne Buchungen seit dem letzten Import — werden als
   * Buchung `import` übernommen.
   */
  bestandUpdate: (GeraetImportBestandChange & { bestandId: string })[];
  /**
   * Abweichungen bei Artikeln mit Buchungen seit dem letzten Import. Werden
   * nur übernommen (als `inventur`), wenn ihr `deviationKey` in
   * `acceptDeviations` steht. Ohne `bestandId`: neuer Lagerort, der erst bei
   * Übernahme angelegt wird.
   */
  deviations: GeraetImportBestandChange[];
  /** Artikel, die mit `active: false` aus der Datei kommen (Dokument-IDs). */
  inactive: string[];
}

export interface GeraetImportExisting {
  geraete: Geraet[];
  bestaende: GeraetBestand[];
  /** Gab es seit dem letzten Import Buchungen an diesem Artikel? */
  hasBookingsSinceImport: (geraetId: string) => boolean;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Gleicht die geparsten Artikel gegen den vorhandenen Bestand ab.
 *
 * Erkannt wird an der Sybos-ID (`externeId`, ersatzweise die Dokument-ID).
 * Bestände eines vorhandenen Artikels werden **nicht stillschweigend
 * überschrieben**, wenn seit dem letzten Import gebucht wurde — dann ist die
 * App neuer als Sybos, und jede Differenz geht als Abweichung in die Vorschau.
 * Ohne solche Buchungen gilt die Datei.
 *
 * Artikel, die nicht in der Datei stehen, bleiben unberührt: Geräte und
 * Lagerartikel kommen aus getrennten Exporten in dieselbe Sammlung.
 */
export function planGeraetImport(
  parsed: ParsedGeraet[],
  existing: GeraetImportExisting,
  { withBestand = true }: { withBestand?: boolean } = {},
): GeraetImportPlan {
  const plan: GeraetImportPlan = {
    create: [],
    update: [],
    unchanged: [],
    bestandCreate: [],
    bestandUnchanged: [],
    bestandUpdate: [],
    deviations: [],
    inactive: [],
  };

  const byExterneId = new Map<string, Geraet>();
  for (const g of existing.geraete) {
    const key = g.externeId || g.id;
    if (!byExterneId.has(key)) byExterneId.set(key, g);
  }
  for (const g of existing.geraete) {
    if (!byExterneId.has(g.id)) byExterneId.set(g.id, g);
  }

  for (const artikel of parsed) {
    const match = byExterneId.get(artikel.externeId);

    if (!match) {
      plan.create.push(artikel);
      for (const b of artikel.bestaende) {
        plan.bestandCreate.push({ geraetId: artikel.externeId, ...b });
      }
      if (!artikel.stammdaten.active) plan.inactive.push(artikel.externeId);
      continue;
    }

    const geraetId = match.id;
    if (!artikel.stammdaten.active) plan.inactive.push(geraetId);

    const changedFields: GeraetImportField[] = [];
    const removedFields: GeraetImportField[] = [];
    for (const field of GERAET_IMPORT_FIELDS) {
      const next = artikel.stammdaten[field];
      const current = match[field];
      if (next === undefined) {
        if (current !== undefined && current !== null && current !== '') {
          removedFields.push(field);
        }
      } else if (!sameValue(next, current)) {
        changedFields.push(field);
      }
    }
    if (changedFields.length > 0 || removedFields.length > 0) {
      plan.update.push({
        geraetId,
        stammdaten: artikel.stammdaten,
        changedFields,
        removedFields,
      });
    } else {
      plan.unchanged.push(geraetId);
    }

    const booked = existing.hasBookingsSinceImport(geraetId);
    const current = existing.bestaende.filter((b) => b.geraetId === geraetId);
    const seen = new Set<string>();

    for (const b of artikel.bestaende) {
      seen.add(b.lagerortKey);
      const bestand = current.find((x) => x.lagerortKey === b.lagerortKey);
      if (!bestand) {
        if (booked) {
          plan.deviations.push({
            geraetId,
            lagerortKey: b.lagerortKey,
            current: 0,
            imported: b.anzahl,
          });
        } else {
          plan.bestandCreate.push({ geraetId, ...b });
        }
        continue;
      }
      classifyChange(plan, booked, geraetId, bestand, b.anzahl);
    }

    // In der Datei nicht mehr vorhandene Lagerorte: Der Bestand dort ist 0.
    // Nicht, wenn die Datei gar keine Lagerorte trägt, und nie bei einem
    // Container — den gibt es nur in der App, Sybos führt ihn nicht als
    // Lagerort, und er fehlte in jeder Datei.
    if (!withBestand) continue;
    for (const bestand of current) {
      if (seen.has(bestand.lagerortKey)) continue;
      if (bestand.lagerort?.art === 'container') continue;
      classifyChange(plan, booked, geraetId, bestand, 0);
    }
  }

  return plan;
}

function classifyChange(
  plan: GeraetImportPlan,
  booked: boolean,
  geraetId: string,
  bestand: GeraetBestand,
  imported: number,
) {
  const ref = { geraetId, bestandId: bestand.id, lagerortKey: bestand.lagerortKey };
  if (bestand.anzahl === imported) {
    plan.bestandUnchanged.push(ref);
    return;
  }
  const change = { ...ref, current: bestand.anzahl, imported };
  if (booked) plan.deviations.push(change);
  else plan.bestandUpdate.push(change);
}
