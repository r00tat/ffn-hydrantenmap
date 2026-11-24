/**
 * pdfjs im Browser: Standard-Build mit Worker. Die Indizierung selbst steckt
 * in `common/objektplan/pdfIndex.ts`, damit der Drive-Abgleich auf dem
 * Server dieselbe nutzt.
 */
import {
  indexPdf as indexPdfWith,
  MAX_TEXT_CHARS,
  type PdfjsLike,
  type PdfPlanIndex,
} from '../../common/objektplan/pdfIndex';

export { MAX_TEXT_CHARS, melderOnPage } from '../../common/objektplan/pdfIndex';
export type { PdfjsLike, PdfjsPage, PdfPlanIndex } from '../../common/objektplan/pdfIndex';

/**
 * Lädt pdfjs im Browser, dynamisch, damit die Bibliothek erst beim Öffnen
 * eines Plans geladen wird.
 */
export async function loadPdfjsLib() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  return pdfjs;
}

/**
 * Wo pdfjs seine WebAssembly-Decoder findet (JBIG2, JPEG 2000, Farbprofile).
 * `scripts/copyPdfjsAssets.mjs` legt sie vor `dev` und `build` aus
 * `pdfjs-dist/wasm` nach `public/pdfjs/wasm/`. Absolut, weil pdfjs im Worker
 * auflöst, dessen Adresse unter `/_next/` liegt.
 */
export function pdfjsWasmUrl(): string {
  return new URL('/pdfjs/wasm/', window.location.origin).toString();
}

export async function loadPdfjsInBrowser(): Promise<PdfjsLike> {
  return (await loadPdfjsLib()) as unknown as PdfjsLike;
}

/** `loadPdfjs` ist einspeisbar, damit der Test den Legacy-Build hereinreicht. */
export function indexPdf(
  data: Uint8Array,
  loadPdfjs: () => Promise<PdfjsLike> = loadPdfjsInBrowser,
  maxTextChars: number = MAX_TEXT_CHARS,
): Promise<PdfPlanIndex> {
  return indexPdfWith(data, loadPdfjs, maxTextChars);
}
