/**
 * Maße und Aufbau der Kartenaufnahme im PDF-Export der Print-Seite.
 *
 * Warum das nicht am Kartenelement selbst hängt: html2pdf rendert nicht den
 * Bildschirm, sondern legt einen Klon des Dokuments in einem Container neu um,
 * der exakt den Satzspiegel breit ist (190mm ≈ 718px). Alles Relative —
 * Prozentbreiten, `height: 100%`, Flexbox-Geschwister, `overflow: hidden` —
 * wird dabei neu aufgelöst und fällt anders aus als in der Anzeige. Eine
 * Aufnahme, die mit `width: 100%` und der Pixelhöhe vom Bildschirm eingehängt
 * wird, verliert deshalb ihr Seitenverhältnis (die Breite schrumpft mit dem
 * Container, die Pixelhöhe nicht), wird vom umgebenden `overflow: hidden`
 * beschnitten und läuft mit ihrer unverkleinerten Höhe über die Seitengrenze.
 *
 * Deshalb bekommt die Aufnahme hier beide Maße absolut in mm und wird als
 * eigener Block neben die Karte gesetzt, nicht in sie hinein.
 */

/** Seitenrand des PDF-Exports in mm; geht unverändert an html2pdf/jsPDF. */
export const PRINT_PDF_MARGIN_MM = 10;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Satzspiegel des Exports (A4 hochkant abzüglich der Seitenränder). */
export const PRINT_CONTENT_WIDTH_MM = A4_WIDTH_MM - 2 * PRINT_PDF_MARGIN_MM;
export const PRINT_CONTENT_HEIGHT_MM = A4_HEIGHT_MM - 2 * PRINT_PDF_MARGIN_MM;

/**
 * Höchste Höhe der Kartenaufnahme. Bewusst unter der vollen Satzspiegelhöhe:
 * html2pdf schiebt ein Element nur dann auf die nächste Seite, wenn es selbst
 * nicht höher als eine Seite ist (`pagebreak.avoid`). Genau an der Grenze
 * würde schon ein Pixel Abstand darüber die Regel aushebeln und die Karte
 * wieder über zwei Seiten zerreißen.
 */
export const PRINT_MAP_MAX_HEIGHT_MM = 240;

/** Klasse der Aufnahme; html2pdf bekommt sie als `pagebreak.avoid`-Selektor. */
export const PRINT_MAP_SNAPSHOT_CLASS = 'print-map-snapshot';

export interface SnapshotSize {
  width: number;
  height: number;
}

export interface SnapshotMm {
  widthMm: number;
  heightMm: number;
}

/**
 * Rechnet die Pixelmaße der Aufnahme auf den Satzspiegel um: so breit wie
 * möglich, ohne das Seitenverhältnis zu ändern und ohne höher zu werden als
 * eine Seite trägt. Entartete Maße (0, NaN) liefern den Satzspiegel selbst.
 */
export function fitMapSnapshot(
  source: SnapshotSize,
  maxWidthMm: number = PRINT_CONTENT_WIDTH_MM,
  maxHeightMm: number = PRINT_MAP_MAX_HEIGHT_MM
): SnapshotMm {
  const ratio = source.height / source.width;

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { widthMm: maxWidthMm, heightMm: maxHeightMm };
  }

  const widthMm = Math.min(maxWidthMm, maxHeightMm / ratio);

  return { widthMm, heightMm: widthMm * ratio };
}

const mm = (value: number) => `${Math.round(value * 100) / 100}mm`;

/**
 * Baut das Bild, das im PDF an die Stelle der interaktiven Karte tritt.
 * `source` sind die Pixelmaße der html2canvas-Aufnahme — ihr Verhältnis
 * entspricht dem sichtbaren Kartenausschnitt.
 */
export function createMapSnapshotImage(
  doc: Document,
  dataUrl: string,
  source: SnapshotSize,
  alt = ''
): HTMLImageElement {
  const { widthMm, heightMm } = fitMapSnapshot(source);

  const img = doc.createElement('img');
  img.src = dataUrl;
  img.alt = alt;
  img.className = PRINT_MAP_SNAPSHOT_CLASS;
  img.style.display = 'block';
  // Falls die Aufnahme doch einmal in einer Flex-Zeile landet: nicht
  // schrumpfen. Die Breite ist in mm festgelegt, die Höhe auch — eine von der
  // Flexbox gestauchte Breite würde genau die Verzerrung zurückbringen, die
  // dieses Modul verhindert.
  img.style.flexShrink = '0';
  img.style.width = mm(widthMm);
  img.style.height = mm(heightMm);
  img.style.breakInside = 'avoid';
  img.style.pageBreakInside = 'avoid';

  return img;
}
