/**
 * Texterkennung eines gescannten Plans über Cloud Vision
 * (`files:asyncBatchAnnotate`, `DOCUMENT_TEXT_DETECTION`). Vision liest das
 * PDF direkt aus dem Bucket und schreibt das Ergebnis als JSON dorthin
 * zurück; danach wird die Ausgabe gelesen und gelöscht. Asynchron, weil der
 * synchrone Aufruf nur fünf Seiten nimmt. Hintergrund: docs/objektplaene.md,
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
    const failed = pages.find((p) => p.error);
    if (pages.length === 0 || (failed && pages.every((p) => p.error))) {
      throw new OcrError(`Texterkennung ohne Ergebnis: ${failed?.error?.message ?? 'leer'}`);
    }
    return pages
      .filter((p) => !p.error)
      .filter((p) => (p.context?.pageNumber ?? 1) <= OCR_MAX_PAGES);
  } finally {
    try {
      await deps.deleteOutput(prefix);
    } catch (err) {
      console.warn('OCR-Ausgabe nicht gelöscht', prefix, err);
    }
  }
}
