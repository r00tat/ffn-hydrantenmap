/**
 * Erzeugt das PDF des Fahrtenbuch-Exports.
 *
 * Nicht in einem Zug: `@react-pdf/renderer` hält das vollständig ausgelegte
 * Dokument bis zum Schluss im Speicher — gemessen 0,3 bis 0,5 MB je
 * Tabellenzeile. Ein Jahresexport über alle Fahrzeuge (770 Fahrten) kam damit
 * auf rund 600 MB Spitzenbedarf und wurde vom Container mit 512 MiB abgeräumt;
 * im Browser erschien das als „Service unavailable" (#665).
 *
 * In Teilen zu rendern und jedes Teil freizugeben begrenzt den Spitzenbedarf
 * auf das größte Teildokument. Gemessen am realen Modell (Spitze im Prozess):
 *
 * | Fall                        | vorher  | in Teilen |
 * |-----------------------------|---------|-----------|
 * | 770 Fahrten, 11 Fahrzeuge   | 598 MB  | 514 MB    |
 * | 1540 Fahrten, 11 Fahrzeuge  | 896 MB  | 677 MB    |
 * | 3000 Fahrten, 1 Fahrzeug    | 2061 MB | 920 MB    |
 *
 * Der Gewinn liegt im Ausreißer, nicht im Regelfall: Verteilen sich die
 * Fahrten auf viele Fahrzeuge, ist ohnehin jedes für sich klein. Ein einzelnes
 * vielgefahrenes Fahrzeug — dieselbe Zeilenzahl, ein Abschnitt — kostete
 * vorher das Vierfache und dauerte doppelt so lange (36,5 s gegen 15,3 s), weil
 * react-pdf einen über viele Seiten laufenden Abschnitt beim Umbrechen
 * wiederholt neu auslegt.
 *
 * Kein Streaming und keine Signed URL: Das fertige PDF eines Jahres ist rund
 * 240 KB groß — die Übertragung war nie das Problem, das Auslegen ist es.
 */

import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import FahrtenbuchPdf, {
  FOOTER_COLOR,
  FOOTER_FONT_SIZE,
  FOOTER_MARGIN,
  FOOTER_OFFSET,
} from './FahrtenbuchPdf';
import {
  chunkFahrtenbuchExport,
  type FahrtenbuchExportModel,
} from './fahrtenbuchExportModel';

/**
 * Zeilen je Teildokument.
 *
 * Jedes Teil beginnt eine neue Seite — zu kleine Teile kosten deshalb Papier,
 * ohne Speicher zu sparen. Gemessen (Spitze bei 770 / bei 1540 Fahrten, Größe
 * der Datei bei 770):
 *
 * | Zeilen | Spitze 770 | Spitze 1540 | Datei  |
 * |--------|------------|-------------|--------|
 * |     15 | 491 MB     | 635 MB      | 327 KB |
 * |     25 | 506 MB     | 628 MB      | 240 KB |
 * |     50 | 531 MB     | 601 MB      | 239 KB |
 * |    100 | 514 MB     | 677 MB      | 237 KB |
 *
 * Unterhalb von 50 wird die Datei größer, weil auf jeder Seite Platz frei
 * bleibt. 100 hält die Datei am kleinsten und begrenzt zugleich den Fall, um
 * den es geht: ein einzelnes Fahrzeug mit sehr vielen Fahrten.
 */
export const ROWS_PER_DOCUMENT = 100;

export interface RenderFahrtenbuchPdfOptions {
  /** Nur für Tests — sonst gilt `ROWS_PER_DOCUMENT`. */
  rowsPerDocument?: number;
}

/**
 * Serialisiert die Renderläufe einer Instanz. Cloud Run lässt bis zu 80
 * Anfragen gleichzeitig auf denselben Container, und zwei Exporte zur selben
 * Zeit addieren ihren Spitzenbedarf — die Aufteilung in Teildokumente nützt
 * dann nichts mehr. Warten ist hier das kleinere Übel: Ein OOM reißt alle
 * laufenden Anfragen der Instanz mit, nicht nur den Export.
 */
let renderQueue: Promise<unknown> = Promise.resolve();

function withRenderSlot<T>(run: () => Promise<T>): Promise<T> {
  // `then(run, run)` startet auch dann, wenn der Vorgänger gescheitert ist.
  const started = renderQueue.then(run, run);
  renderQueue = started.catch(() => undefined);
  return started;
}

export async function renderFahrtenbuchPdf(
  model: FahrtenbuchExportModel,
  pageLabel: (page: number, total: number) => string,
  options: RenderFahrtenbuchPdfOptions = {},
): Promise<Uint8Array> {
  const rowsPerDocument = options.rowsPerDocument ?? ROWS_PER_DOCUMENT;

  return withRenderSlot(async () => {
    const merged = await PDFDocument.create();

    for (const chunk of chunkFahrtenbuchExport(model, rowsPerDocument)) {
      const part = await PDFDocument.load(
        await renderToBuffer(FahrtenbuchPdf({ model: chunk })),
      );
      const pages = await merged.copyPages(part, part.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }

    stampPageNumbers(merged, pageLabel, await merged.embedFont(StandardFonts.Helvetica));

    return merged.save();
  });
}

/**
 * Schreibt „Seite 3/7" in den Fuß jeder Seite.
 *
 * Erst nach dem Zusammenfügen: Die Teildokumente kennen nur ihre eigenen
 * Seiten, react-pdf würde in jedem Teil wieder bei 1 zu zählen anfangen. Die
 * Maße stammen aus dem Fußstil von `FahrtenbuchPdf`, damit die Zahl auf
 * derselben Grundlinie sitzt wie der Erstellungsvermerk daneben.
 */
function stampPageNumbers(
  document: PDFDocument,
  pageLabel: (page: number, total: number) => string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
): void {
  // `drawText` setzt die Grundlinie, react-pdf die Unterkante der Zeile. Der
  // Abstand dazwischen ist die Unterlänge der Schrift — sonst stünde die Zahl
  // um gut einen Punkt zu tief.
  const descent =
    font.heightAtSize(FOOTER_FONT_SIZE) -
    font.heightAtSize(FOOTER_FONT_SIZE, { descender: false });

  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = pageLabel(index + 1, pages.length);
    page.drawText(label, {
      x: page.getWidth() - FOOTER_MARGIN - font.widthOfTextAtSize(label, FOOTER_FONT_SIZE),
      y: FOOTER_OFFSET + descent,
      size: FOOTER_FONT_SIZE,
      font,
      color: rgb(FOOTER_COLOR, FOOTER_COLOR, FOOTER_COLOR),
    });
  });
}
