/**
 * Liest den PDF-Export eines digitalen Fahrtenbuchs. Zwei Hälften: die
 * Anbindung an pdfjs (`extractPdfItems`) und der reine Tabellenparser
 * (`parseFahrtenbuchPdf`). Nur die erste kennt die Bibliothek — die Logik ist
 * damit ohne PDF, ohne DOM und ohne Worker testbar.
 */

/** Ein Textstück mit Position, alles was der Parser braucht. */
export interface PdfTextItem {
  text: string;
  /** Linke Kante in PDF-Punkten, Ursprung unten links. */
  x: number;
  y: number;
  width: number;
}

export type PdfPages = PdfTextItem[][];

interface PdfjsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{
          items: { str?: string; transform?: number[]; width?: number }[];
        }>;
      }>;
    }>;
  };
}

/**
 * Lädt pdfjs im Browser. Dynamisch, damit die Bibliothek erst beim Öffnen des
 * Importdialogs geladen wird und nicht im Hauptbundle steckt. Der Worker wird
 * über `new URL(…, import.meta.url)` aufgelöst, damit Webpack und Turbopack
 * ihn als Asset mitnehmen.
 */
async function loadPdfjsInBrowser(): Promise<PdfjsLike> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  return pdfjs as unknown as PdfjsLike;
}

/**
 * PDF-Bytes zu Textelementen je Seite. `loadPdfjs` ist einspeisbar: der
 * Integrationstest reicht den Legacy-Build herein, der unter Node läuft.
 */
export async function extractPdfItems(
  data: Uint8Array,
  loadPdfjs: () => Promise<PdfjsLike> = loadPdfjsInBrowser,
): Promise<PdfPages> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: PdfPages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items
        .filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
        .map((i) => ({
          text: i.str as string,
          x: i.transform?.[4] ?? 0,
          y: i.transform?.[5] ?? 0,
          width: i.width ?? 0,
        })),
    );
  }
  return pages;
}

export type RowProblem =
  | 'kmMismatch'
  | 'kmMissing'
  | 'timeMissing'
  | 'dateInvalid';

export interface PdfFahrtRow {
  /** Laufende Nummer über alle Seiten — Bezug für die Vorschau. */
  line: number;
  datum: string;
  von?: string;
  bis?: string;
  fahrer: string;
  grund: string;
  zweckStrecke: string;
  startKm?: number;
  endeKm?: number;
  gefahreneKm?: number;
  treibstoff?: number;
  adBlue?: number;
  notizen: string;
  problem?: RowProblem;
  /** Ganze Zeile als Text — die Vorschau zeigt sie bei einem Problem. */
  raw: string;
}

export interface PdfParseResult {
  vehicleName?: string;
  kennzeichen?: string;
  rows: PdfFahrtRow[];
  error?: 'unknownFormat' | 'empty';
}

const COLUMN_KEYS = [
  'datum',
  'zeit',
  'fahrer',
  'grund',
  'zweck',
  'startKm',
  'endeKm',
  'gefKm',
  'treibstoff',
  'adBlue',
  'notizen',
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

/** Kopfzeilentexte, normalisiert (klein, ohne Leerzeichen und Punkte). */
const HEADER_TO_KEY: Record<string, ColumnKey> = {
  datum: 'datum',
  zeit: 'zeit',
  fahrer: 'fahrer',
  grund: 'grund',
  'zweck/strecke': 'zweck',
  startkm: 'startKm',
  endekm: 'endeKm',
  gefkm: 'gefKm',
  treibstoff: 'treibstoff',
  adblue: 'adBlue',
  notizen: 'notizen',
};

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
const TIME_RANGE_RE = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/;
/**
 * Ganzzahl der Kilometerspalten. Entweder durchgehend in Tausenderblöcken
 * (`14,646`) oder ganz ohne Trenner (`946`, `14646`) — eine halb getrennte
 * Zahl wie `14,64` ist ein Lesefehler und wird abgewiesen.
 */
const INT_RE = /^(\d{1,3}(,\d{3})+|\d+)$/;

function normalizeHeader(text: string): string {
  return text.toLowerCase().replace(/[\s.]/g, '');
}

/**
 * Items einer Seite zu Zeilen. Der PDF-Ursprung liegt unten links, deshalb
 * absteigend nach y. Die Toleranz fängt Rundungsabweichungen innerhalb einer
 * gesetzten Zeile ab.
 */
export function groupRows(
  items: PdfTextItem[],
  tolerance = 3,
): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(current[0].y - item.y) <= tolerance)
      current.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

/**
 * Belegte x-Bereiche über alle Datenzeilen zählen und die dauerhaft leeren
 * Streifen als Spaltentrenner zurückgeben. `threshold` lässt einzelne
 * Ausreißer zu — ein überlaufender Text darf einen Trenner nicht schließen.
 */
export function columnSeparators(rows: PdfTextItem[][]): number[] {
  if (rows.length === 0) return [];
  const bucket = (x: number) => Math.floor(x);
  const coverage = new Map<number, number>();
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const covered = new Set<number>();
    for (const item of row) {
      const from = bucket(item.x);
      const to = bucket(item.x + item.width);
      for (let b = from; b <= to; b += 1) covered.add(b);
      min = Math.min(min, from);
      max = Math.max(max, to);
    }
    for (const b of covered) coverage.set(b, (coverage.get(b) ?? 0) + 1);
  }

  const threshold = Math.max(1, Math.floor(rows.length * 0.02));
  const separators: number[] = [];
  let runStart: number | undefined;
  for (let b = min; b <= max; b += 1) {
    const empty = (coverage.get(b) ?? 0) <= threshold;
    if (empty && runStart === undefined) runStart = b;
    if (!empty && runStart !== undefined) {
      separators.push((runStart + b - 1) / 2);
      runStart = undefined;
    }
  }
  return separators;
}

/**
 * Verbindet Items, die dicht nebeneinander stehen. Nötig für die Kopfzeile:
 * „Start KM“ kann als zwei Textstücke ankommen, und die Trennerverfeinerung
 * dürfte dazwischen keine Spaltengrenze sehen.
 */
export function mergeAdjacent(items: PdfTextItem[], maxGap = 8): PdfTextItem[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const merged: PdfTextItem[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.x - (last.x + last.width) <= maxGap) {
      last.text = `${last.text} ${item.text}`;
      last.width = item.x + item.width - last.x;
      continue;
    }
    merged.push({ ...item });
  }
  return merged;
}

/**
 * Ergänzt Trenner, die den Daten nicht zu entnehmen sind. Eine Spalte, die
 * fast immer leer ist, hinterlässt keine Belegung — „Notizen“ ist im
 * Beispielexport in 154 von 156 Zeilen leer und läge unter der
 * Ausreißerschwelle. Ohne diesen Schritt fiele sie mit „AdBlue“ in eine Zelle
 * und beide Spalten wären nicht mehr zuzuordnen.
 *
 * Die Kopfzeile weiß dagegen immer, wie viele Spalten es gibt.
 */
export function refineWithHeader(
  separators: number[],
  headerCells: PdfTextItem[],
): number[] {
  const result = [...separators];
  for (let i = 0; i + 1 < headerCells.length; i += 1) {
    const a = headerCells[i];
    const b = headerCells[i + 1];
    // Geprüft wird gegen die Mitten der Überschriften, nicht gegen ihre
    // Kanten: Eine breite Überschrift wie „Gef. KM“ ragt über ihre schmalen
    // Datenwerte hinaus, der echte Trenner liegt dann innerhalb der
    // Kopfzelle. Gegen die Kanten geprüft, hielte man ihn für fehlend und
    // zöge eine zusätzliche Spalte ein.
    const centerA = a.x + a.width / 2;
    const centerB = b.x + b.width / 2;
    if (!result.some((s) => s > centerA && s < centerB)) {
      result.push((a.x + a.width + b.x) / 2);
    }
  }
  return result.sort((x, y) => x - y);
}

/** Zellen einer Zeile anhand der Trenner; Items einer Zelle mit Leerzeichen verbunden. */
export function splitIntoCells(
  row: PdfTextItem[],
  separators: number[],
): string[] {
  const cells: string[][] = Array.from(
    { length: separators.length + 1 },
    () => [],
  );
  for (const item of row) {
    const center = item.x + item.width / 2;
    const index = separators.filter((s) => s < center).length;
    cells[Math.min(index, cells.length - 1)].push(item.text);
  }
  return cells.map((parts) => parts.join(' ').replace(/\s+/g, ' ').trim());
}

/**
 * Ordnet die Zellindizes den Spaltenschlüsseln zu. Gesucht wird die Zeile, die
 * `Datum` und `Notizen` enthält; sie wird mit denselben Trennern zerlegt wie
 * die Datenzeilen, damit mehrteilige Überschriften („Start KM“) in einer Zelle
 * landen.
 */
export function mapColumns(
  headerCells: string[],
): Partial<Record<ColumnKey, number>> {
  const mapping: Partial<Record<ColumnKey, number>> = {};
  headerCells.forEach((cell, index) => {
    const key = HEADER_TO_KEY[normalizeHeader(cell)];
    if (key !== undefined && mapping[key] === undefined) mapping[key] = index;
  });
  return mapping;
}

function parseInteger(value: string): number | undefined {
  const text = value.trim();
  if (!INT_RE.test(text)) return undefined;
  return Number(text.replace(/,/g, ''));
}

/**
 * Betriebsmittelmenge. Hier ist ein Komma **immer** ein Dezimaltrennzeichen —
 * anders als in den Kilometerspalten, wo es die Tausender trennt. Eine Tankung
 * erreicht keine vierstellige Literzahl, ein Kilometerstand dagegen regelmäßig.
 *
 * Ohne diese Trennung liefe `1,234` an `DECIMAL_RE` (höchstens zwei
 * Nachkommastellen) vorbei, fiele auf die Ganzzahl zurück und würde zu 1234
 * Litern statt 1,234 — ein stiller Faktor 1000 in einem Nachweisdokument.
 */
function parseDecimal(value: string): number | undefined {
  const text = value.trim();
  if (text === '' || text === '-') return undefined;
  if (!/^\d+(,\d+)?$/.test(text)) return undefined;
  return Number(text.replace(',', '.'));
}

/**
 * `dd.mm.yyyy` als Kalenderdatum — oder `undefined`, wenn es den Tag nicht gibt.
 *
 * `new Date` rollt einen zu großen Tag stillschweigend weiter: aus dem
 * 31.02.2025 wird der 03.03.2025, und `NaN` entsteht dabei nie. Ein unmögliches
 * Datum muss aber als unlesbar gelten und nicht als ein anderes, plausibel
 * aussehendes — in einem Nachweisdokument ist die stille Verschiebung der
 * schlimmere Fehler. Deshalb der Rückvergleich.
 */
function parseGermanDate(
  datum: string,
): { day: number; month: number; year: number } | undefined {
  if (!DATE_RE.test(datum)) return undefined;
  const [day, month, year] = datum.split('.').map(Number);
  const probe = new Date(year, month - 1, day);
  if (
    probe.getDate() !== day ||
    probe.getMonth() !== month - 1 ||
    probe.getFullYear() !== year
  ) {
    return undefined;
  }
  return { day, month, year };
}

/**
 * `dd.mm.yyyy` plus `HH:MM` als ISO-Zeitstempel in Ortszeit. Der Export nennt
 * keine Zeitzone; die Fahrten sind lokal erfasst, also werden sie lokal
 * gelesen.
 */
export function toIsoTimestamp(
  datum: string,
  time: string,
): string | undefined {
  const date = parseGermanDate(datum);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!date || !clock) return undefined;
  const [hours, minutes] = [Number(clock[1]), Number(clock[2])];
  const value = new Date(
    date.year,
    date.month - 1,
    date.day,
    hours,
    minutes,
    0,
    0,
  );
  // Eine Uhrzeit wie „25:70" rollt genauso weiter wie ein zu großer Tag.
  if (value.getHours() !== hours || value.getMinutes() !== minutes) {
    return undefined;
  }
  return value.toISOString();
}

/**
 * Trennt eine Zahl ab, die aus der Nachbarspalte in eine Textzelle gerutscht
 * ist. Der Export bricht überlange Texte nicht um, sondern lässt sie über die
 * Zellgrenze laufen; dort verkleben sie mit dem rechtsbündigen Zahlenwert zu
 * einem einzigen Textstück (`freimachen15,134`).
 */
export function splitTrailingNumber(text: string): {
  text: string;
  number?: string;
} {
  const withSeparator = /^(.*?)(\d{1,3}(?:,\d{3})+)$/.exec(text);
  if (withSeparator && withSeparator[1].trim() !== '') {
    return { text: withSeparator[1].trim(), number: withSeparator[2] };
  }
  // Unter 1000 km trägt der Wert keinen Tausendertrenner — bei einem Anhänger
  // oder einem neuen Fahrzeug ist das der Normalfall. Zwei Bedingungen halten
  // die Regel eng: mindestens drei Ziffern, und davor unmittelbar ein Zeichen,
  // das weder Ziffer noch Komma noch Leerzeichen ist. Damit bleibt „Bergung A4"
  // unangetastet (zu kurz), ebenso „Objekt 123" (Leerzeichen davor, die Zahl
  // gehört zum Text) und eine bereits reine Zahl wie „14646" (Ziffer davor).
  // Eine dennoch falsche Trennung bliebe nicht verborgen: die Selbstprüfung
  // `Ende − Start == Gef.` meldet die Zeile dann als `kmMismatch`.
  const glued = /^(.*[^\d,\s])(\d{3,})$/.exec(text);
  if (glued && glued[1].trim() !== '') {
    return { text: glued[1].trim(), number: glued[2] };
  }
  return { text };
}

function readRow(
  cells: string[],
  columns: Partial<Record<ColumnKey, number>>,
  line: number,
): PdfFahrtRow {
  const cell = (key: ColumnKey) => {
    const index = columns[key];
    return index === undefined ? '' : (cells[index] ?? '');
  };

  let zweckStrecke = cell('zweck');
  let startRaw = cell('startKm');
  let endeRaw = cell('endeKm');

  // Reparatur in Leserichtung: erst Zweck → Start KM, dann Start KM → Ende KM.
  if (startRaw === '') {
    const split = splitTrailingNumber(zweckStrecke);
    if (split.number) {
      zweckStrecke = split.text;
      startRaw = split.number;
    }
  }
  if (endeRaw === '') {
    const split = splitTrailingNumber(startRaw);
    if (split.number) {
      startRaw = split.text;
      endeRaw = split.number;
    }
  }

  const datum = cell('datum');
  const time = TIME_RANGE_RE.exec(cell('zeit'));
  const startKm = parseInteger(startRaw);
  const endeKm = parseInteger(endeRaw);
  const gefahreneKm = parseInteger(cell('gefKm'));

  const row: PdfFahrtRow = {
    line,
    datum,
    von: time?.[1],
    bis: time?.[2],
    fahrer: cell('fahrer'),
    grund: cell('grund'),
    zweckStrecke,
    startKm,
    endeKm,
    gefahreneKm,
    treibstoff: parseDecimal(cell('treibstoff')),
    adBlue: parseDecimal(cell('adBlue')),
    notizen: cell('notizen'),
    // Immer gesetzt, damit eine fehlerfreie Zeile das Feld ausdrücklich leer
    // trägt statt es wegzulassen — die Vorschau und die Tests fragen es ab.
    problem: undefined,
    raw: cells.filter(Boolean).join(' | '),
  };

  // Reihenfolge der Prüfungen: Was die Zeile unbrauchbar macht, zuerst.
  // Geprüft wird das Kalenderdatum, nicht bloß das Format — sonst ginge der
  // 31.02. als 03.03. durch.
  if (!parseGermanDate(datum)) row.problem = 'dateInvalid';
  else if (!time) row.problem = 'timeMissing';
  else if (startKm === undefined || endeKm === undefined)
    row.problem = 'kmMissing';
  else if (gefahreneKm !== undefined && endeKm - startKm !== gefahreneKm) {
    // Die Quelle liefert die Differenz mit. Geht sie nicht auf, wurde die
    // Zeile falsch gelesen — das ist die Selbstprüfung des Parsers.
    row.problem = 'kmMismatch';
  }
  return row;
}

const TITLE_RE = /Fahrtenbuch:\s*(.+?)\s*(?:\(([^)]+)\))?\s*$/;

/**
 * Liest alle Seiten. Die Spaltentrenner werden **einmal über alle Seiten**
 * bestimmt: Der Export setzt die Tabelle auf jeder Seite gleich, und je mehr
 * Zeilen einfließen, desto sicherer sind die leeren Streifen.
 */
export function parseFahrtenbuchPdf(pages: PdfPages): PdfParseResult {
  const allRows = pages.flatMap((items) => groupRows(items));
  if (allRows.length === 0) return { rows: [], error: 'empty' };

  const title = allRows
    .map((row) => TITLE_RE.exec(row.map((i) => i.text).join(' ')))
    .find((match): match is RegExpExecArray => match !== null);

  const dataRows = allRows.filter((row) =>
    DATE_RE.test(row[0]?.text?.trim() ?? ''),
  );
  const headerRow = allRows.find((row) => {
    const text = row.map((i) => normalizeHeader(i.text)).join('');
    return text.includes('datum') && text.includes('notizen');
  });
  if (!headerRow || dataRows.length === 0) {
    return { rows: [], error: 'unknownFormat' };
  }

  // Zwei Quellen, in dieser Reihenfolge: die Daten liefern die Grenzen dort,
  // wo Text und Zahlen tatsächlich stehen, die Kopfzeile ergänzt die Grenzen
  // von Spalten, die in fast allen Zeilen leer sind.
  const headerCells = mergeAdjacent(headerRow);
  const separators = refineWithHeader(columnSeparators(dataRows), headerCells);
  const columns = mapColumns(splitIntoCells(headerRow, separators));
  if (
    columns.datum === undefined ||
    columns.startKm === undefined ||
    columns.endeKm === undefined ||
    columns.zweck === undefined
  ) {
    return { rows: [], error: 'unknownFormat' };
  }

  return {
    vehicleName: title?.[1]?.trim(),
    kennzeichen: title?.[2]?.trim(),
    rows: dataRows.map((row, index) =>
      readRow(splitIntoCells(row, separators), columns, index + 1),
    ),
  };
}
