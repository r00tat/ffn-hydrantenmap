/**
 * Erzeugt das PDF des Füllprotokolls.
 *
 * In Teilen gerendert und danach zusammengefügt — genau wie beim Fahrtenbuch
 * (`renderFahrtenbuchPdf.ts`, Issue #665): `@react-pdf/renderer` hält das
 * vollständig ausgelegte Dokument bis zum Schluss im Speicher, und ein
 * Jahresprotokoll über tausend Füllungen räumte den Container mit 512 MiB ab.
 * Jedes Teil einzeln zu rendern und freizugeben begrenzt den Spitzenbedarf auf
 * das größte Teildokument.
 *
 * Die Seitenzahl wird erst nach dem Zusammenfügen gestempelt: Ein Teil kennt
 * nur seine eigenen Seiten und finge sonst jedes Mal wieder bei 1 an.
 */

import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import FuellprotokollPdf, {
  FOOTER_COLOR,
  FOOTER_FONT_SIZE,
  FOOTER_MARGIN,
  FOOTER_OFFSET,
} from './FuellprotokollPdf';
import {
  chunkFuellprotokollExport,
  type FuellprotokollExportModel,
} from './fuellprotokollExportModel';

/** Zeilen je Teildokument — dieselbe gemessene Größe wie im Fahrtenbuch. */
export const ROWS_PER_DOCUMENT = 100;

export interface RenderFuellprotokollPdfOptions {
  /** Nur für Tests — sonst gilt `ROWS_PER_DOCUMENT`. */
  rowsPerDocument?: number;
}

/**
 * Serialisiert die Renderläufe einer Instanz. Cloud Run lässt bis zu 80
 * Anfragen gleichzeitig auf denselben Container, und zwei Ausdrucke zur selben
 * Zeit addieren ihren Spitzenbedarf. Warten ist das kleinere Übel: Ein OOM
 * reißt alle laufenden Anfragen der Instanz mit.
 */
let renderQueue: Promise<unknown> = Promise.resolve();

function withRenderSlot<T>(run: () => Promise<T>): Promise<T> {
  // `then(run, run)` startet auch dann, wenn der Vorgänger gescheitert ist.
  const started = renderQueue.then(run, run);
  renderQueue = started.catch(() => undefined);
  return started;
}

export async function renderFuellprotokollPdf(
  model: FuellprotokollExportModel,
  pageLabel: (page: number, total: number) => string,
  options: RenderFuellprotokollPdfOptions = {},
): Promise<Uint8Array> {
  const rowsPerDocument = options.rowsPerDocument ?? ROWS_PER_DOCUMENT;

  return withRenderSlot(async () => {
    const merged = await PDFDocument.create();

    for (const chunk of chunkFuellprotokollExport(model, rowsPerDocument)) {
      const part = await PDFDocument.load(
        await renderToBuffer(FuellprotokollPdf({ model: chunk })),
      );
      const pages = await merged.copyPages(part, part.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }

    stampPageNumbers(
      merged,
      pageLabel,
      await merged.embedFont(StandardFonts.Helvetica),
    );

    return merged.save();
  });
}

/**
 * Schreibt „Seite 3/7" in den Fuß jeder Seite, auf dieselbe Grundlinie wie den
 * Erstellungsvermerk daneben.
 */
function stampPageNumbers(
  document: PDFDocument,
  pageLabel: (page: number, total: number) => string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
): void {
  // `drawText` setzt die Grundlinie, react-pdf die Unterkante der Zeile. Der
  // Abstand dazwischen ist die Unterlänge der Schrift.
  const descent =
    font.heightAtSize(FOOTER_FONT_SIZE) -
    font.heightAtSize(FOOTER_FONT_SIZE, { descender: false });

  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = pageLabel(index + 1, pages.length);
    page.drawText(label, {
      x:
        page.getWidth() -
        FOOTER_MARGIN -
        font.widthOfTextAtSize(label, FOOTER_FONT_SIZE),
      y: FOOTER_OFFSET + descent,
      size: FOOTER_FONT_SIZE,
      font,
      color: rgb(FOOTER_COLOR, FOOTER_COLOR, FOOTER_COLOR),
    });
  });
}
