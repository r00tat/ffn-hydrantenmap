/**
 * Einmaliger Import der Bekleidungs-Bestandslisten aus dem Excel.
 *
 * Gelesen werden die Blätter „Bestandsliste Einsatzbekleidung" und
 * „Bestandsliste Dienstbekleidung". Die Datei ist von Hand gepflegt; die
 * Regeln hier legen ihre Eigenheiten aus (Tag-Nummer „Eigen", Status
 * „Reinigung", Freitext in der Namensspalte, „nicht bekannt" als Datum).
 * Alles ist rein — Vorschau und Plan laufen im Browser und auf dem Server
 * gleich.
 */
import {
  GROESSE_UNBEKANNT,
  normalizeGroesse,
  normalizeTagNummer,
  type BekleidungArtikel,
  type BekleidungAusgabe,
  type BekleidungEigentum,
  type BekleidungFuehrung,
  type BekleidungKategorie,
  type BekleidungStatus,
  type BekleidungStueck,
  type Stamps,
} from './bekleidung';
import {
  matchPersonName,
  normalizePersonName,
  type PersonMatch,
} from './personNameMatch';
import { excelSerialToIsoDate } from './xlsx';

export const SHEET_EINSATZ = 'Bestandsliste Einsatzbekleidung';
export const SHEET_DIENST = 'Bestandsliste Dienstbekleidung';

/**
 * Größte Importdatei in Bytes. Server Actions nehmen höchstens 1 MB entgegen,
 * Base64 bläht um ein Drittel auf — dieselbe Grenze wie beim Geräte-Import
 * (`GERAET_IMPORT_MAX_BYTES`). Dialog und Server Action prüfen beide.
 */
export const BEKLEIDUNG_IMPORT_MAX_BYTES = 700_000;

export interface ImportAusgabeBlock {
  nachname: string;
  vorname: string;
  ausgegebenAm?: string;
  zurueckAm?: string;
  /** „ausgegeben am" stand als Text da (z. B. „nicht bekannt"). */
  datumUnbekannt: boolean;
}

export interface ImportRow {
  sheet: BekleidungKategorie;
  /** Zeile im Raster, 1-basiert (entspricht der Excel-Zeile, solange das Blatt keine Lücken hat). */
  rowNumber: number;
  hersteller: string;
  art: string;
  charge?: string;
  tagNummer?: string;
  eigentum: BekleidungEigentum;
  groesse: string;
  status: BekleidungStatus;
  waschgaengeAltbestand: number;
  bemerkungen: string[];
  ausgaben: ImportAusgabeBlock[];
}

interface BlockColumns {
  nachname: number;
  vorname: number;
  am?: number;
  zurueck?: number;
}

interface SheetColumns {
  hersteller: number;
  art: number;
  charge?: number;
  tag: number;
  groesse: number;
  bemerkung?: number;
  status: number;
  waschgaenge?: number;
  blocks: BlockColumns[];
}

const headerText = (value: string | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const collapse = (value: string | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ');

function mapColumns(header: string[]): SheetColumns {
  const normalized = header.map(headerText);
  const find = (...names: string[]) => {
    const index = normalized.findIndex((h) => names.includes(h));
    return index >= 0 ? index : undefined;
  };

  const required = {
    hersteller: find('hersteller'),
    art: find('art', 'artikel'),
    tag: find('tag nummer'),
    groesse: find('größe'),
    status: find('status aktuell'),
  };
  const labels: Record<keyof typeof required, string> = {
    hersteller: 'Hersteller',
    art: 'Art/Artikel',
    tag: 'Tag Nummer',
    groesse: 'Größe',
    status: 'Status aktuell',
  };
  const missing = (Object.keys(required) as (keyof typeof required)[])
    .filter((k) => required[k] === undefined)
    .map((k) => labels[k]);
  if (missing.length > 0) {
    throw new Error(`Bekleidungsimport: Spalten fehlen: ${missing.join(', ')}`);
  }

  // Ausgabeblöcke: zweimal „ausgegeben an" (Nachname, Vorname), danach
  // optional „ausgegeben am" und „zurück am".
  const blocks: BlockColumns[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    if (normalized[i] !== 'ausgegeben an' || normalized[i + 1] !== 'ausgegeben an') {
      continue;
    }
    const block: BlockColumns = { nachname: i, vorname: i + 1 };
    let next = i + 2;
    if (normalized[next] === 'ausgegeben am') block.am = next++;
    if (normalized[next] === 'zurück am') block.zurueck = next++;
    blocks.push(block);
    i = next - 1;
  }

  return {
    hersteller: required.hersteller!,
    art: required.art!,
    charge: find('charge'),
    tag: required.tag!,
    groesse: required.groesse!,
    bemerkung: find('bemerkung'),
    status: required.status!,
    waschgaenge: find('waschgänge'),
    blocks,
  };
}

const STATUS_MAP: Record<string, BekleidungStatus> = {
  ausgegeben: 'ausgegeben',
  lager: 'lager',
  'nicht da': 'nicht_auffindbar',
  ausgeschieden: 'ausgeschieden',
  '': 'lager',
};

/** Frühestes und spätestes plausibles Jahr eines Ausgabedatums. */
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

const plausible = (iso: string | undefined) => {
  if (!iso) return undefined;
  const year = Number(iso.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR ? iso : undefined;
};

/**
 * Datum aus einer Zelle: Excel-Seriennummer oder, falls jemand das Datum als
 * Text eingetippt hat, `TT.MM.JJJJ` bzw. `JJJJ-MM-TT`. Unplausible Jahre
 * gelten als unlesbar — in der Datei steht mitunter nur ein Jahr („2020"),
 * das als Seriennummer im Jahr 1905 landete, oder ein Tippfehler.
 */
function parseDateCell(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const serial = excelSerialToIsoDate(value);
  if (serial) return plausible(serial);
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (de) {
    return plausible(`${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return plausible(value);
  // Manche Leser liefern ein Datum als ISO-Zeitstempel („2023-11-20T00:00:00.000Z").
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return plausible(value.slice(0, 10));
  return undefined;
}

/** Schreibweisen für „Datum nicht bekannt", die keine Bemerkung brauchen. */
const UNKNOWN_DATE_RE = /^(nicht bekannt|unbekannt|n\.?\s?b\.?)$/i;

/**
 * Eine Tag-Nummer ist ein zusammenhängender Code mit mindestens vier Ziffern
 * — numerisch („22081702") oder alphanumerisch („189WFI1200003"). Text wie
 * „Alter Druck" ist keine Nummer.
 */
const isTagCode = (value: string) =>
  /^[0-9A-Za-z-]+$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 4;

/** Zellwert für die Anzeige in einer Bemerkung: Datum lesbar, Zahl ohne „.0". */
const displayCell = (raw: string) => parseDateCell(raw) ?? normalizeTagNummer(raw) ?? '';

/**
 * Ein Blatt der Bestandsliste in Importzeilen. Die Kopfzeile ist die erste
 * Zeile mit „Tag Nummer"; Spalten werden über ihren Kopf zugeordnet, nicht
 * über die Position.
 */
export function parseBekleidungSheet(
  grid: string[][],
  kategorie: BekleidungKategorie,
): ImportRow[] {
  const headerIndex = grid.findIndex((row) =>
    row.some((cell) => headerText(cell) === 'tag nummer'),
  );
  if (headerIndex < 0) {
    throw new Error('Bekleidungsimport: Kopfzeile mit „Tag Nummer" nicht gefunden');
  }
  const columns = mapColumns(grid[headerIndex]);
  const rows: ImportRow[] = [];

  for (let r = headerIndex + 1; r < grid.length; r++) {
    const cells = grid[r];
    if (cells.every((cell) => !cell || !cell.trim())) continue;
    const cell = (index: number | undefined) =>
      index === undefined ? '' : collapse(cells[index]);

    const bemerkungen: string[] = [];

    // Tag-Nummer und Eigentum
    const tagRaw = cell(columns.tag);
    let tagNummer: string | undefined;
    let eigentum: BekleidungEigentum = 'feuerwehr';
    const tagLower = tagRaw.toLowerCase();
    if (tagLower === 'eigen') {
      eigentum = 'privat';
    } else if (tagLower === 'feuerwehr' || tagLower === '') {
      // keine Tag-Nummer
    } else if (isTagCode(normalizeTagNummer(tagRaw) ?? '')) {
      tagNummer = normalizeTagNummer(tagRaw);
    } else {
      bemerkungen.push(`Tag Nummer im Excel: ${tagRaw}`);
    }

    // Status
    const statusRaw = cell(columns.status);
    let status = STATUS_MAP[statusRaw.toLowerCase()];
    if (!status) {
      status = 'lager';
      bemerkungen.push(`Status im Excel: ${statusRaw}`);
    }

    // Waschgänge
    let waschgaengeAltbestand = 0;
    const waschRaw = cell(columns.waschgaenge);
    if (/^\d+(\.\d+)?(E\+?\d+)?$/i.test(waschRaw)) {
      waschgaengeAltbestand = Math.round(Number(waschRaw));
    } else if (waschRaw !== '' && waschRaw !== '-') {
      bemerkungen.push(`Waschgänge: ${waschRaw}`);
    }

    const bemerkungSpalte = cell(columns.bemerkung);
    if (bemerkungSpalte) bemerkungen.push(bemerkungSpalte);

    // Ausgabeblöcke
    const ausgaben: ImportAusgabeBlock[] = [];
    for (const block of columns.blocks) {
      const nachname = cell(block.nachname);
      const vorname = cell(block.vorname);
      const amRaw = cell(block.am);
      const zurueckRaw = cell(block.zurueck);
      if (!nachname && !vorname && !amRaw && !zurueckRaw) continue;
      if (!vorname && !amRaw && !zurueckRaw) {
        // Freitext in der Namensspalte, z. B. „Tasche abgerissen".
        bemerkungen.push(nachname);
        continue;
      }
      if (!nachname && !vorname) {
        const parts = [
          amRaw && `ausgegeben am ${displayCell(amRaw)}`,
          zurueckRaw && `zurück am ${displayCell(zurueckRaw)}`,
        ].filter(Boolean);
        bemerkungen.push(`Ausgabe ohne Namen: ${parts.join(', ')}`);
        continue;
      }
      const ausgegebenAm = parseDateCell(amRaw);
      const zurueckAm = parseDateCell(zurueckRaw);
      if (amRaw && !ausgegebenAm && !UNKNOWN_DATE_RE.test(amRaw)) {
        bemerkungen.push(`ausgegeben am im Excel: ${displayCell(amRaw)}`);
      }
      if (zurueckRaw && !zurueckAm && !UNKNOWN_DATE_RE.test(zurueckRaw)) {
        // Zurückgegeben, aber das Datum ist unlesbar: als zurück zählen,
        // sonst hielte der Import das Stück für noch ausgegeben.
        bemerkungen.push(`zurück am im Excel: ${displayCell(zurueckRaw)}`);
      }
      ausgaben.push({
        nachname,
        vorname,
        ausgegebenAm,
        zurueckAm: zurueckAm ?? (zurueckRaw ? UNKNOWN_RETURN_DATE : undefined),
        datumUnbekannt: amRaw !== '' && ausgegebenAm === undefined,
      });
    }

    rows.push({
      sheet: kategorie,
      rowNumber: r + 1,
      hersteller: cell(columns.hersteller),
      art: cell(columns.art),
      charge: normalizeTagNummer(cell(columns.charge)),
      tagNummer,
      eigentum,
      // Ohne Größe hätte das Stück kein gültiges Feld und der Bestand keine ID.
      groesse: normalizeTagNummer(cell(columns.groesse)) ?? GROESSE_UNBEKANNT,
      status,
      waschgaengeAltbestand,
      bemerkungen,
      ausgaben,
    });
  }
  return rows;
}

/**
 * Platzhalter in `ImportAusgabeBlock.zurueckAm` für ein „zurück am", das als
 * Text dastand (z. B. „Rep. 05/26"): Der Block ist geschlossen, das Datum
 * unbekannt. Die Vorschau zeigt ihn als „unbekannt"; `buildImportPlan`
 * ersetzt ihn durch das Importdatum.
 */
export const UNKNOWN_RETURN_DATE = '?';

export interface ImportArtikelProposal {
  key: string;
  kategorie: BekleidungKategorie;
  bezeichnung: string;
  hersteller?: string;
  fuehrung: BekleidungFuehrung;
  rowCount: number;
}

export function artikelKey(
  kategorie: BekleidungKategorie,
  art: string,
  hersteller: string,
): string {
  const norm = (v: string) => collapse(v).toLowerCase();
  return `${kategorie}|${norm(art)}|${norm(hersteller)}`;
}

export interface ImportPreview {
  rows: ImportRow[];
  artikel: ImportArtikelProposal[];
  /** key = normalizePersonName(`${vorname} ${nachname}`) */
  persons: { key: string; nachname: string; vorname: string; match: PersonMatch }[];
  duplicateTags: {
    tagNummer: string;
    rowNumbers: { sheet: BekleidungKategorie; rowNumber: number }[];
  }[];
  statusConflicts: { sheet: BekleidungKategorie; rowNumber: number; message: string }[];
}

const personKeyOf = (block: ImportAusgabeBlock) =>
  normalizePersonName(`${block.vorname} ${block.nachname}`);

const rowArtikelKey = (row: ImportRow) => artikelKey(row.sheet, row.art, row.hersteller);

const isOpen = (block: ImportAusgabeBlock) => !block.zurueckAm;

const STATUS_LABEL: Record<BekleidungStatus, string> = {
  lager: 'Lager',
  ausgegeben: 'ausgegeben',
  ausgeschieden: 'ausgeschieden',
  nicht_auffindbar: 'nicht auffindbar',
};

export function buildImportPreview(
  einsatz: ImportRow[],
  dienst: ImportRow[],
  persons: { id: string; name: string }[],
): ImportPreview {
  const rows = [...einsatz, ...dienst];

  const artikel = new Map<string, ImportArtikelProposal>();
  for (const row of rows) {
    const key = rowArtikelKey(row);
    let proposal = artikel.get(key);
    if (!proposal) {
      proposal = {
        key,
        kategorie: row.sheet,
        bezeichnung: row.art,
        ...(row.hersteller ? { hersteller: row.hersteller } : {}),
        fuehrung: 'menge',
        rowCount: 0,
      };
      artikel.set(key, proposal);
    }
    proposal.rowCount += 1;
    if (row.tagNummer) proposal.fuehrung = 'einzeln';
  }

  const personMap = new Map<string, ImportPreview['persons'][number]>();
  for (const row of rows) {
    for (const block of row.ausgaben) {
      const key = personKeyOf(block);
      if (personMap.has(key)) continue;
      personMap.set(key, {
        key,
        nachname: block.nachname,
        vorname: block.vorname,
        match: matchPersonName(block.nachname, block.vorname, persons),
      });
    }
  }

  const tags = new Map<string, { sheet: BekleidungKategorie; rowNumber: number }[]>();
  for (const row of rows) {
    if (!row.tagNummer) continue;
    const list = tags.get(row.tagNummer) ?? [];
    list.push({ sheet: row.sheet, rowNumber: row.rowNumber });
    tags.set(row.tagNummer, list);
  }
  const duplicateTags = [...tags.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([tagNummer, rowNumbers]) => ({ tagNummer, rowNumbers }));

  const statusConflicts: ImportPreview['statusConflicts'] = [];
  for (const row of rows) {
    const open = row.ausgaben.filter(isOpen).length;
    let message: string | undefined;
    if (open > 0 && row.status !== 'ausgegeben') {
      message = `Offene Ausgabe, aber Status „${STATUS_LABEL[row.status]}" — wird mit dem Importdatum geschlossen`;
    } else if (row.status === 'ausgegeben' && open === 0) {
      message = 'Status ausgegeben, aber keine offene Ausgabe';
    } else if (open > 1) {
      message = `${open} offene Ausgaben — nur die letzte bleibt offen`;
    }
    if (message) {
      statusConflicts.push({ sheet: row.sheet, rowNumber: row.rowNumber, message });
    }
  }

  return {
    rows,
    artikel: [...artikel.values()],
    persons: [...personMap.values()],
    duplicateTags,
    statusConflicts,
  };
}

export interface ImportDecisions {
  /** artikelKey → Führung */
  fuehrung: Record<string, BekleidungFuehrung>;
  /** person key → bestehende Person oder neu anzulegender Name */
  persons: Record<string, { personId: string } | { create: string }>;
}

export interface ImportPlan {
  artikel: (Omit<BekleidungArtikel, keyof Stamps | 'id'> & { key: string })[];
  personsToCreate: { key: string; name: string }[];
  stuecke: (Omit<
    BekleidungStueck,
    keyof Stamps | 'id' | 'artikelId' | 'personId' | 'ausgabeId'
  > & { artikelKey: string; personKey?: string; tempId: string })[];
  bestand: { artikelKey: string; groesse: string; anzahl: number }[];
  ausgaben: (Omit<
    BekleidungAusgabe,
    keyof Stamps | 'id' | 'personId' | 'stueckId' | 'artikelId'
  > & { artikelKey: string; personKey: string; stueckTempId?: string })[];
}

type PlanAusgabe = ImportPlan['ausgaben'][number];

/** `undefined`-Felder weglassen — Firestore speichert sie nicht. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Aus Vorschau und Entscheidungen den Schreibplan bauen. IDs gibt es hier
 * noch nicht; Stücke tragen eine `tempId`, Artikel und Personen ihren
 * Schlüssel — die Server Action verknüpft sie beim Schreiben.
 */
export function buildImportPlan(
  preview: ImportPreview,
  decisions: ImportDecisions,
  today: string,
): ImportPlan {
  const fuehrungOf = new Map<string, BekleidungFuehrung>();
  const artikel: ImportPlan['artikel'] = preview.artikel.map((a) => {
    const fuehrung = decisions.fuehrung[a.key] ?? a.fuehrung;
    fuehrungOf.set(a.key, fuehrung);
    return compact({
      key: a.key,
      kategorie: a.kategorie,
      bezeichnung: a.bezeichnung,
      hersteller: a.hersteller,
      fuehrung,
      aktiv: true,
    });
  });

  // Personen: jede verwendete braucht eine Entscheidung.
  const personsToCreate: ImportPlan['personsToCreate'] = [];
  const usedPersons = new Set<string>();
  for (const row of preview.rows) {
    for (const block of row.ausgaben) {
      const key = personKeyOf(block);
      if (usedPersons.has(key)) continue;
      usedPersons.add(key);
      const decision = decisions.persons[key];
      if (!decision) {
        throw new Error(`Bekleidungsimport: keine Entscheidung für Person „${key}"`);
      }
      if ('create' in decision) {
        const name = collapse(decision.create) || collapse(`${block.vorname} ${block.nachname}`);
        personsToCreate.push({ key, name });
      }
    }
  }

  const stuecke: ImportPlan['stuecke'] = [];
  const ausgaben: ImportPlan['ausgaben'] = [];
  const bestand = new Map<string, { artikelKey: string; groesse: string; anzahl: number }>();
  const seenTags = new Set<string>();

  for (const row of preview.rows) {
    const key = rowArtikelKey(row);
    const fuehrung = fuehrungOf.get(key) ?? 'menge';
    const bemerkungen = [...row.bemerkungen];

    // Welcher Block bleibt offen? Nur bei Status „ausgegeben", und dann nur
    // der letzte offene. Alle anderen offenen Blöcke schließt der Import.
    const openIndexes = row.ausgaben
      .map((block, index) => (isOpen(block) ? index : -1))
      .filter((index) => index >= 0);
    const keepOpen =
      row.status === 'ausgegeben' && openIndexes.length > 0
        ? openIndexes[openIndexes.length - 1]
        : -1;

    const tempId = `${row.sheet}-${row.rowNumber}`;
    const rowAusgaben: PlanAusgabe[] = row.ausgaben.map((block, index) => {
      let zurueckAm = block.zurueckAm;
      let bemerkung: string | undefined;
      if (zurueckAm === UNKNOWN_RETURN_DATE) {
        zurueckAm = today;
        bemerkung = 'Rückgabedatum unbekannt, beim Import gesetzt';
      } else if (!zurueckAm && index !== keepOpen) {
        zurueckAm = today;
        bemerkung = `Beim Import geschlossen (Status im Excel: ${STATUS_LABEL[row.status]})`;
      }
      return compact({
        artikelKey: key,
        personKey: personKeyOf(block),
        groesse: row.groesse,
        menge: 1,
        ausgegebenAm: block.ausgegebenAm,
        zurueckAm,
        bemerkung,
        quelle: 'import' as const,
      });
    });

    if (fuehrung === 'einzeln') {
      let tagNummer = row.tagNummer;
      if (tagNummer) {
        if (seenTags.has(tagNummer)) {
          bemerkungen.push(`Tag-Nummer doppelt: ${tagNummer}`);
          tagNummer = undefined;
        } else {
          seenTags.add(tagNummer);
        }
      }
      const open = keepOpen >= 0 ? row.ausgaben[keepOpen] : undefined;
      stuecke.push(
        compact({
          tempId,
          artikelKey: key,
          personKey: open ? personKeyOf(open) : undefined,
          tagNummer,
          groesse: row.groesse,
          charge: row.charge,
          eigentum: row.eigentum,
          status: row.status,
          bemerkung: bemerkungen.length > 0 ? bemerkungen.join('; ') : undefined,
          ausgegebenAm: open?.ausgegebenAm,
          waschgaenge: 0,
          waschgaengeAltbestand: row.waschgaengeAltbestand,
        }),
      );
      for (const a of rowAusgaben) ausgaben.push({ ...a, stueckTempId: tempId });
    } else {
      // Mengenartikel: Lagerzeilen der Feuerwehr zählen zum Bestand.
      if (row.status === 'lager' && row.eigentum === 'feuerwehr') {
        const groesse = normalizeGroesse(row.groesse);
        const bestandKey = `${key}\u0000${groesse}`;
        const entry = bestand.get(bestandKey) ?? { artikelKey: key, groesse, anzahl: 0 };
        entry.anzahl += 1;
        bestand.set(bestandKey, entry);
      }
      // Ohne Stück gehen die Bemerkungen der Zeile an ihre Ausgaben. Eine
      // private Zeile trägt `eigentum: 'privat'` an der Ausgabe, damit eine
      // spätere Rücknahme sie nicht in den Bestand der Feuerwehr bucht.
      const rowNote = bemerkungen.join('; ');
      const eigentum = row.eigentum === 'privat' ? ('privat' as const) : undefined;
      for (const a of rowAusgaben) {
        const bemerkung = [a.bemerkung, rowNote].filter(Boolean).join('; ');
        ausgaben.push(compact({ ...a, bemerkung: bemerkung || undefined, eigentum }));
      }
    }
  }

  return {
    artikel,
    personsToCreate,
    stuecke,
    bestand: [...bestand.values()],
    ausgaben,
  };
}
