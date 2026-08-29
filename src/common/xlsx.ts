import { unzipSync, strFromU8 } from 'fflate';

/**
 * Ein Arbeitsblatt aus einer XLSX-Datei als Raster von Strings.
 *
 * Bewusst kein vollständiger XLSX-Parser und kein zusätzliches Paket: Gelesen
 * wird genau ein bekanntes Exportformat (der Artikelexport aus FDISK). Zahlen
 * kommen als String zurück, wie sie in der Datei stehen — die fachliche
 * Auslegung („45250 ist ein Datum", „6,8 ist ein Volumen") gehört nach
 * `atemschutzImport.ts` und nicht hierher.
 */
export function readXlsxSheet(data: Uint8Array, sheetIndex = 1): string[][] {
  const files = unzipSync(data);

  const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`;
  const sheetXml = files[sheetPath];
  if (!sheetXml) {
    throw new Error(`xlsx: ${sheetPath} nicht gefunden`);
  }

  const shared = readSharedStrings(files['xl/sharedStrings.xml']);
  return parseSheet(strFromU8(sheetXml), shared);
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
