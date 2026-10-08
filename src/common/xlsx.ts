import { unzipSync, strFromU8 } from 'fflate';

/**
 * Ein Arbeitsblatt aus einer XLSX-Datei als Raster von Strings.
 *
 * Bewusst kein vollständiger XLSX-Parser und kein zusätzliches Paket: Gelesen
 * wird genau ein bekanntes Exportformat (der Artikelexport aus Sybos). Zahlen
 * kommen als String zurück, wie sie in der Datei stehen — die fachliche
 * Auslegung („45250 ist ein Datum", „6,8 ist ein Volumen") gehört nach
 * `atemschutzImport.ts` und nicht hierher.
 */
export function readXlsxSheet(
  data: Uint8Array,
  sheetIndex = 1,
  maxPartBytes = XLSX_MAX_PART_BYTES,
): string[][] {
  return readSheetByPath(
    data,
    `xl/worksheets/sheet${sheetIndex}.xml`,
    maxPartBytes,
  );
}

/**
 * Die Blätter einer Mappe in ihrer Reihenfolge, mit der Nummer der Datei
 * (`xl/worksheets/sheet<index>.xml`), in der das Blatt liegt.
 *
 * Reihenfolge und Dateinummer fallen auseinander, sobald jemand Blätter
 * verschiebt oder löscht. Deshalb wird über `xl/workbook.xml` (Name → r:id)
 * und `xl/_rels/workbook.xml.rels` (r:id → Ziel) aufgelöst.
 */
export function listXlsxSheets(
  data: Uint8Array,
  maxPartBytes = XLSX_MAX_PART_BYTES,
): { name: string; index: number }[] {
  return readSheetPaths(data, maxPartBytes).flatMap(({ name, path }) => {
    const index = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(path)?.[1];
    return index ? [{ name, index: Number(index) }] : [];
  });
}

/**
 * Ein Blatt über seinen Namen lesen. Der Name muss exakt stimmen.
 */
export function readXlsxSheetByName(
  data: Uint8Array,
  name: string,
  maxPartBytes = XLSX_MAX_PART_BYTES,
): string[][] {
  const sheet = readSheetPaths(data, maxPartBytes).find((s) => s.name === name);
  if (!sheet) {
    throw new Error(`xlsx: Blatt "${name}" nicht gefunden`);
  }
  return readSheetByPath(data, sheet.path, maxPartBytes);
}

/**
 * Excel-Seriennummer (Tage seit dem 30.12.1899) in ein ISO-Datum
 * `YYYY-MM-DD`. Ein Uhrzeitanteil wird abgeschnitten. Text, leere Werte und
 * Zahlen ≤ 0 liefern `undefined` — die Auslegung („nicht bekannt") bleibt dem
 * Aufrufer.
 *
 * Der Schalttag-Fehler von Excel (29.02.1900) betrifft nur Seriennummern
 * unter 61 und spielt für reale Daten keine Rolle.
 */
export function excelSerialToIsoDate(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const days = Math.floor(Number(trimmed));
  if (!Number.isFinite(days) || days <= 0) return undefined;
  const ms = Date.UTC(1899, 11, 30) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function readSheetByPath(
  data: Uint8Array,
  sheetPath: string,
  maxPartBytes: number,
): string[][] {
  const files = unzipParts(data, [sheetPath, SHARED_STRINGS_PATH], maxPartBytes);

  const sheetXml = files[sheetPath];
  if (!sheetXml) {
    throw new Error(`xlsx: ${sheetPath} nicht gefunden`);
  }

  const shared = readSharedStrings(files[SHARED_STRINGS_PATH]);
  return parseSheet(strFromU8(sheetXml), shared);
}

const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels';

/** Name und Pfad im Archiv je Blatt, in der Reihenfolge der Mappe. */
function readSheetPaths(
  data: Uint8Array,
  maxPartBytes: number,
): { name: string; path: string }[] {
  const files = unzipParts(
    data,
    [WORKBOOK_PATH, WORKBOOK_RELS_PATH],
    maxPartBytes,
  );
  const workbook = files[WORKBOOK_PATH];
  if (!workbook) {
    throw new Error(`xlsx: ${WORKBOOK_PATH} nicht gefunden`);
  }
  const rels = files[WORKBOOK_RELS_PATH];
  if (!rels) {
    throw new Error(`xlsx: ${WORKBOOK_RELS_PATH} nicht gefunden`);
  }

  const targets = new Map<string, string>();
  for (const rel of strFromU8(rels).match(RELATIONSHIP_RE) ?? []) {
    const id = attribute(rel, 'Id');
    const target = attribute(rel, 'Target');
    if (id && target) targets.set(id, resolveTarget(target));
  }

  const sheets: { name: string; path: string }[] = [];
  for (const sheet of strFromU8(workbook).match(SHEET_RE) ?? []) {
    const name = attribute(sheet, 'name');
    const rid = attribute(sheet, 'r:id');
    const path = rid ? targets.get(rid) : undefined;
    if (name !== undefined && path) sheets.push({ name: decodeXml(name), path });
  }
  return sheets;
}

/**
 * Ziel einer Relationship in einen Pfad im Archiv. Relative Ziele beziehen
 * sich auf `xl/`, absolute beginnen mit `/`.
 */
function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ['xl'];
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

function attribute(xml: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\s${escaped}="([^"]*)"`).exec(xml)?.[1];
}

/**
 * Höchstgröße eines entpackten Teils der Datei. Der Artikelexport von Sybos
 * hat ein Blatt von wenigen MB; die Grenze schützt den Server vor einer
 * Zip-Bombe, deren Teil auf Hunderte MB aufgeht.
 */
export const XLSX_MAX_PART_BYTES = 50 * 1024 * 1024;

const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';

/**
 * Entpackt nur die genannten Teile, jeden höchstens `maxPartBytes` groß.
 *
 * Ohne Filter entpackt `unzipSync` jeden Eintrag des Archivs in den
 * Speicher. Die Grenze gilt für die im Archiv angegebene Größe: `fflate`
 * entpackt in einen Puffer genau dieser Größe und vergrößert ihn nicht, ein
 * gelogener Eintrag kann also nicht mehr belegen.
 */
function unzipParts(
  data: Uint8Array,
  names: string[],
  maxPartBytes: number,
): Record<string, Uint8Array> {
  const tooLarge: string[] = [];
  let total = 0;
  const files = unzipSync(data, {
    filter: (file) => {
      if (!names.includes(file.name)) return false;
      total += file.originalSize;
      if (file.originalSize > maxPartBytes || total > maxPartBytes * names.length) {
        tooLarge.push(file.name);
        return false;
      }
      return true;
    },
  });
  if (tooLarge.length > 0) {
    throw new Error(`xlsx: ${tooLarge.join(', ')} zu groß`);
  }
  return files;
}

/**
 * Die Tabelle der geteilten Zeichenketten. Fehlt sie, hat die Datei nur
 * Inline-Werte — dann ist eine leere Tabelle richtig, kein Fehler.
 */
function readSharedStrings(xml?: Uint8Array): string[] {
  if (!xml) return [];
  const text = strFromU8(xml);
  const items: string[] = [];
  // Ein `<si>` kann mehrere `<t>` enthalten (formatierte Teilstücke) — sie
  // gehören zu einer Zeichenkette zusammengesetzt.
  for (const si of text.match(SI_RE) ?? []) {
    items.push(joinTextNodes(si));
  }
  return items;
}

/**
 * Ein Element samt Inhalt — oder, wenn es leer ist, sein selbstschließendes
 * Tag.
 *
 * Die Reihenfolge im Muster ist entscheidend: `[^>]*?` frisst auch den
 * Schrägstrich eines `<c r="D2"/>`, weshalb eine Alternative
 * `<c[^>]*>…</c>` ein leeres Tag als Beginn eines gefüllten läse und alle
 * Zellen bis zum nächsten `</c>` mitverschluckte. Genau daran verschob sich
 * der Artikelexport um mehrere Spalten. Deshalb wird `/>` *vor* `>` geprüft.
 */
function elementRe(tag: string): RegExp {
  return new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`, 'g');
}

const SI_RE = elementRe('si');
const ROW_RE = elementRe('row');
const CELL_RE = elementRe('c');
const TEXT_RE = elementRe('t');
const SHEET_RE = /<sheet\b[^>]*>/g;
const RELATIONSHIP_RE = /<Relationship\b[^>]*>/g;

/** Spaltenbuchstaben in einen Nullindex: A → 0, Z → 25, AA → 26. */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? '';
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * XML-Entities auflösen.
 *
 * `&amp;` steht bewusst zuletzt: Andernfalls würde `&amp;lt;` erst zu `&lt;`
 * und dann weiter zu `<` — eine Bezeichnung, die im Klartext „&lt;" enthält,
 * käme verstümmelt an.
 */
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&amp;/g, '&');
}

/** Alle `<t>`-Knoten eines Fragments zu einer Zeichenkette zusammensetzen. */
function joinTextNodes(xml: string): string {
  const parts = xml.match(TEXT_RE) ?? [];
  return parts
    .map((p) => {
      const inner = /^<t\b[^>]*?>([\s\S]*)<\/t>$/.exec(p)?.[1];
      // Ein selbstschließendes `<t/>` trägt keinen Text bei.
      return inner === undefined ? '' : decodeXml(inner);
    })
    .join('');
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowXml of xml.match(ROW_RE) ?? []) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(CELL_RE) ?? []) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const type = /\bt="([^"]+)"/.exec(cellXml)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      // Übersprungene Spalten auffüllen: Eine leere Zelle steht in der Datei
      // gar nicht drin, und ohne das Auffüllen verschöben sich alle folgenden
      // Werte einer Zeile.
      while (cells.length < index) cells.push('');
      cells[index] = cellValue(cellXml, type, shared);
    }
    rows.push(cells);
  }
  // Die Kopfzeile bestimmt die Breite; kürzere Zeilen werden aufgefüllt, damit
  // ein Zugriff auf eine hintere Spalte nie `undefined` liefert.
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => {
    const filled = [...row];
    while (filled.length < width) filled.push('');
    return filled.map((value) => value ?? '');
  });
}

function cellValue(
  cellXml: string,
  type: string | undefined,
  shared: string[],
): string {
  if (type === 'inlineStr') {
    return joinTextNodes(cellXml);
  }
  const raw = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  if (raw === undefined) return '';
  if (type === 's') return shared[Number(raw)] ?? '';
  return decodeXml(raw);
}
