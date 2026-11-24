import 'server-only';

import { indexPdf, type PdfjsLike, type PdfPlanIndex } from '../../common/objektplan/pdfIndex';

/**
 * Der Legacy-Build läuft unter Node und nimmt dort einen Fake-Worker im
 * selben Thread. Den holt pdfjs sonst per dynamischem Import über
 * `workerSrc` (`./pdf.worker.mjs`) — den verfolgt das Tracing des
 * Standalone-Builds nicht, im Container fehlte die Datei. Vorab geladen
 * und unter `globalThis.pdfjsWorker` abgelegt, nimmt pdfjs ihn von dort.
 */
async function loadPdfjsForNode(): Promise<PdfjsLike> {
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLike;
}

/** Plan-Index (Seitentext, Melder) eines PDFs auf dem Server. */
export function indexPdfOnServer(data: Uint8Array): Promise<PdfPlanIndex> {
  return indexPdf(data, loadPdfjsForNode);
}
