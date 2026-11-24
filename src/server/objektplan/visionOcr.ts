/**
 * Texterkennung eines gescannten Plans über Cloud Vision
 * (`files:asyncBatchAnnotate`, `DOCUMENT_TEXT_DETECTION`). Vision liest das
 * PDF direkt aus dem Bucket und schreibt das Ergebnis als JSON dorthin
 * zurück; danach wird die Ausgabe gelesen und gelöscht. Das dauert auch bei
 * kleinen Plänen oft eine halbe Minute, weil der Auftrag bei Vision erst in
 * einer Warteschlange liegt. Pläne bis fünf Seiten gehen deshalb direkt an
 * `files:annotate` (Antwort in Sekunden, ohne Bucket); nur größere nehmen den
 * asynchronen Weg (`ocrPdf`). Hintergrund: docs/objektplaene.md,
 * „Texterkennung (OCR)".
 *
 * Der regionale Endpunkt hält die Verarbeitung in der EU — die Pläne zeigen
 * Grundrisse und Zugänge.
 */
import type { VisionPageResponse } from '../../common/objektplan/ocrIndex';

export const VISION_ENDPOINT = 'https://eu-vision.googleapis.com/v1';
/** Ordner der Zwischenablage im Bucket; die Storage-Regeln sperren ihn. */
export const OCR_OUTPUT_PREFIX = 'ocr-ausgabe';
/** Obergrenze je Plan — mehr Seiten hat kein Brandschutzplan, die Kosten bleiben überschaubar. */
export const OCR_MAX_PAGES = 200;
/** Höchstzahl Seiten des direkten Aufrufs `files:annotate` (Vorgabe von Vision). */
export const OCR_SYNC_MAX_PAGES = 5;

export interface VisionOcrDeps {
  request<T>(options: { url: string; method: 'GET' | 'POST'; data?: unknown }): Promise<T>;
  /** Inhalte der JSON-Dateien unter dem Präfix. */
  readOutput(prefix: string): Promise<string[]>;
  deleteOutput(prefix: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

interface Operation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
}

export class OcrError extends Error {}

export async function ocrPdfInBucket(
  bucketName: string,
  storagePath: string,
  outputPrefix: string,
  deps: VisionOcrDeps,
  { pollMs = 3000, timeoutMs = 240_000 }: { pollMs?: number; timeoutMs?: number } = {},
): Promise<VisionPageResponse[]> {
  const prefix = outputPrefix.endsWith('/') ? outputPrefix : `${outputPrefix}/`;
  const started = await deps.request<Operation>({
    url: `${VISION_ENDPOINT}/files:asyncBatchAnnotate`,
    method: 'POST',
    data: {
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: `gs://${bucketName}/${storagePath}` },
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          outputConfig: {
            gcsDestination: { uri: `gs://${bucketName}/${prefix}` },
            batchSize: 20,
          },
        },
      ],
    },
  });
  if (!started.name) throw new OcrError('Vision lieferte keine Operation');

  try {
    let operation = started;
    for (let waited = 0; !operation.done; waited += pollMs) {
      if (waited >= timeoutMs) throw new OcrError('Texterkennung dauerte zu lange');
      await deps.sleep(pollMs);
      operation = await deps.request<Operation>({
        url: `${VISION_ENDPOINT}/${started.name}`,
        method: 'GET',
      });
    }
    if (operation.error) {
      throw new OcrError(`Texterkennung fehlgeschlagen: ${operation.error.message ?? operation.error.code}`);
    }

    const pages: VisionPageResponse[] = [];
    for (const raw of await deps.readOutput(prefix)) {
      const parsed = JSON.parse(raw) as { responses?: VisionPageResponse[] };
      pages.push(...(parsed.responses ?? []));
    }
    return usablePages(pages).filter((p) => (p.context?.pageNumber ?? 1) <= OCR_MAX_PAGES);
  } finally {
    try {
      await deps.deleteOutput(prefix);
    } catch (err) {
      console.warn('OCR-Ausgabe nicht gelöscht', prefix, err);
    }
  }
}

interface AnnotateFilesResponse {
  responses?: Array<{
    totalPages?: number;
    responses?: VisionPageResponse[];
    error?: { code?: number; message?: string };
  }>;
}

/** Nur die Seiten ohne Fehler; wirft, wenn keine Seite erkannt wurde. */
function usablePages(pages: VisionPageResponse[]): VisionPageResponse[] {
  const failed = pages.find((p) => p.error);
  if (pages.length === 0 || (failed && pages.every((p) => p.error))) {
    throw new OcrError(`Texterkennung ohne Ergebnis: ${failed?.error?.message ?? 'leer'}`);
  }
  return pages.filter((p) => !p.error);
}

/**
 * Direkter Aufruf für kleine Pläne. Liefert `undefined`, wenn das Dokument
 * mehr Seiten hat, als der direkte Aufruf liest — dann bleibt nur der
 * asynchrone Weg.
 */
async function ocrSmallPdfInBucket(
  bucketName: string,
  storagePath: string,
  pageCount: number,
  deps: VisionOcrDeps,
): Promise<VisionPageResponse[] | undefined> {
  const response = await deps.request<AnnotateFilesResponse>({
    url: `${VISION_ENDPOINT}/files:annotate`,
    method: 'POST',
    data: {
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: `gs://${bucketName}/${storagePath}` },
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages: Array.from({ length: pageCount }, (_, i) => i + 1),
        },
      ],
    },
  });
  const file = response.responses?.[0];
  if (!file || file.error) {
    throw new OcrError(`Texterkennung fehlgeschlagen: ${file?.error?.message ?? file?.error?.code ?? 'leer'}`);
  }
  if ((file.totalPages ?? 0) > OCR_SYNC_MAX_PAGES) return undefined;
  return usablePages(file.responses ?? []);
}

/**
 * Texterkennung eines PDFs im Bucket, auf dem schnellsten Weg: bis fünf
 * Seiten direkt, sonst asynchron. Ohne bekannte Seitenzahl wird der direkte
 * Weg versucht; meldet Vision mehr Seiten, folgt der asynchrone.
 */
export async function ocrPdf(
  bucketName: string,
  storagePath: string,
  outputPrefix: string,
  deps: VisionOcrDeps,
  options: { pageCount?: number; pollMs?: number; timeoutMs?: number } = {},
): Promise<VisionPageResponse[]> {
  const { pageCount, ...asyncOptions } = options;
  if (pageCount === undefined || pageCount <= OCR_SYNC_MAX_PAGES) {
    const pages = await ocrSmallPdfInBucket(
      bucketName,
      storagePath,
      Math.min(Math.max(pageCount ?? OCR_SYNC_MAX_PAGES, 1), OCR_SYNC_MAX_PAGES),
      deps,
    );
    if (pages) return pages;
  }
  return ocrPdfInBucket(bucketName, storagePath, outputPrefix, deps, asyncOptions);
}
