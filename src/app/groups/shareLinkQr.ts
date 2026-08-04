import { downloadBlob } from '../../components/firebase/download';

/**
 * Export des Fahrtenbuch-Share-QR-Codes als PNG-Datei und als Druckseite.
 *
 * Beide Wege gehen vom SVG aus, das ohnehin schon im Dialog steht, statt den
 * Code ein zweites Mal zu erzeugen. So kann ein Ausdruck nie auf einen anderen
 * Link zeigen als das, was der Admin am Bildschirm sieht.
 */

/**
 * Kantenlänge des PNG-Exports in Pixeln. Am Bildschirm steht der Code mit
 * 200 px — zu wenig für einen Ausdruck oder den Versand per Messenger. 1024 px
 * füllt eine A4-Seite mit ~170 dpi und bleibt als Datei klein genug, um sie
 * ohne Nachdenken zu verschicken.
 */
export const QR_PNG_SIZE = 1024;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Der Browser hat das Druckfenster blockiert (Pop-up-Blocker). */
export class PrintWindowBlockedError extends Error {
  constructor() {
    super('print window blocked');
    this.name = 'PrintWindowBlockedError';
  }
}

/**
 * Serialisiert das gerenderte QR-SVG zu eigenständigem Markup.
 *
 * React legt das Element im SVG-Namespace an, schreibt aber kein `xmlns`-
 * Attribut ins DOM. Als `data:`-URL ohne Namensraum-Deklaration verweigert der
 * Bild-Decoder die Arbeit. `XMLSerializer` ergänzt sie in aktuellen Browsern
 * selbst; auf einer Kopie setzen kostet nichts und macht es unabhängig davon.
 */
export function serializeQrSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NAMESPACE);
  return new XMLSerializer().serializeToString(clone);
}

/**
 * Dateiname des PNG-Exports. Die Gruppen-ID steckt drin, weil ein Admin
 * mehrerer Gruppen sonst mehrere `fahrtenbuch-link.png` im Download-Ordner
 * liegen hätte und nicht mehr wüsste, welcher Code zu welcher Gruppe gehört.
 */
export function shareLinkQrFilename(groupId: string): string {
  const slug = groupId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `fahrtenbuch-link${slug ? `-${slug}` : ''}.png`;
}

/**
 * Rastert das SVG-Markup über ein Canvas zu einem PNG.
 *
 * PNG statt SVG, weil die Datei am Ende in einer Nachricht oder einem
 * Word-Dokument landet — dort zeigt ein SVG je nach Programm gar nichts an.
 * Das Canvas ist quadratisch wie der Code; das Vektor-Original wird dabei
 * hochskaliert und bleibt scharf.
 */
export async function svgToPngBlob(
  markup: string,
  size: number,
): Promise<Blob> {
  const image = new Image(size, size);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('QR code SVG could not be decoded'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');

  // Ein Canvas startet transparent. Ohne diese Füllung wäre ein QR-Code, dessen
  // helle Module transparent bleiben, in jedem Viewer mit dunklem Hintergrund
  // unscannbar — genau dort, wo die Datei am ehesten geöffnet wird.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('PNG encoding failed')),
      'image/png',
    );
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface QrPrintLabels {
  /** Überschrift der Druckseite. */
  heading: string;
  /** Name der Gruppe; entfällt, wenn keiner bekannt ist. */
  groupName?: string;
  /** Erklärung für den, der den Zettel vorfindet. */
  hint: string;
  /** Der Link im Klartext — als Rückfallebene, wenn das Scannen scheitert. */
  url: string;
  /** `lang`-Attribut der Druckseite. */
  locale: string;
}

/**
 * Baut die vollständige Druckseite. Ein eigenständiges Dokument statt einer
 * `@media print`-Regel im Dialog: Der Abschnitt steckt in einem MUI-Dialog,
 * dessen Overlay- und Scroll-Container beim Drucken der App-Seite mitkommen
 * würden.
 *
 * Das SVG-Markup wird unescaped eingesetzt — es stammt aus dem eigenen DOM,
 * nicht aus einer Eingabe. Alle Textbausteine werden escaped, weil der
 * Gruppenname aus Firestore kommt.
 */
export function qrPrintDocument(
  svgMarkup: string,
  { heading, groupName, hint, url, locale }: QrPrintLabels,
): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(heading)}</title>
<style>
  @page { margin: 15mm; }
  body {
    margin: 0;
    font-family: Helvetica, Arial, sans-serif;
    color: #000;
    background: #fff;
    text-align: center;
  }
  h1 { font-size: 24pt; margin: 0 0 4mm; }
  .group { font-size: 18pt; margin: 0 0 8mm; }
  .hint { font-size: 13pt; margin: 8mm 0 4mm; }
  .url { font-size: 10pt; color: #333; word-break: break-all; }
  svg { width: 120mm; height: 120mm; }
</style>
</head>
<body>
<h1>${escapeHtml(heading)}</h1>
${groupName ? `<p class="group">${escapeHtml(groupName)}</p>\n` : ''}${svgMarkup}
<p class="hint">${escapeHtml(hint)}</p>
<p class="url">${escapeHtml(url)}</p>
<script>window.onload=function(){window.focus();window.print();};</script>
</body>
</html>`;
}

/**
 * Öffnet die Druckseite in einem neuen Fenster. Der Druckdialog wird von der
 * Seite selbst per `onload` ausgelöst statt von hier aus: Nach `document.close()`
 * ist das Layout noch nicht zwingend fertig, und ein `print()` davor druckt in
 * manchen Browsern eine leere Seite.
 */
export function printShareLinkQr(
  svg: SVGSVGElement,
  labels: QrPrintLabels,
): void {
  const win = window.open('', '_blank');
  // Bei aktivem Pop-up-Blocker ist `win` null. Stillschweigend nichts zu tun
  // sähe für den Admin wie ein kaputter Button aus.
  if (!win) throw new PrintWindowBlockedError();
  // `document.write` ist hier der einzige Weg, ein vollständiges Dokument samt
  // DOCTYPE und <head> in ein frisch geöffnetes Fenster zu bekommen. Die
  // üblichen XSS-Bedenken greifen nicht: alle Textbausteine sind escaped, und
  // das SVG stammt aus dem eigenen DOM statt aus einer Eingabe.
  win.document.write(qrPrintDocument(serializeQrSvg(svg), labels));
  win.document.close();
}

/** Lädt den QR-Code als PNG herunter (nativ: über das Teilen-Menü). */
export async function downloadShareLinkQr(
  svg: SVGSVGElement,
  groupId: string,
): Promise<void> {
  const blob = await svgToPngBlob(serializeQrSvg(svg), QR_PNG_SIZE);
  await downloadBlob(blob, shareLinkQrFilename(groupId));
}
