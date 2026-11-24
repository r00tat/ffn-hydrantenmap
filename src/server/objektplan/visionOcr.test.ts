import { describe, expect, it, vi } from 'vitest';
import { ocrPdf, ocrPdfInBucket, OcrError, type VisionOcrDeps } from './visionOcr';

function deps(overrides: Partial<VisionOcrDeps> = {}) {
  const calls: Array<{ url: string; method: string; data?: unknown }> = [];
  let polls = 0;
  const base: VisionOcrDeps = {
    request: async <T,>(o: { url: string; method: 'GET' | 'POST'; data?: unknown }) => {
      calls.push(o);
      if (o.method === 'POST') return { name: 'operations/abc' } as T;
      polls += 1;
      return { name: 'operations/abc', done: polls >= 2 } as T;
    },
    readOutput: async () => [
      JSON.stringify({
        responses: [
          { context: { pageNumber: 2 }, fullTextAnnotation: { text: 'b' } },
          { context: { pageNumber: 1 }, fullTextAnnotation: { text: 'a' } },
        ],
      }),
    ],
    deleteOutput: vi.fn(async () => {}),
    sleep: async () => {},
  };
  return { d: { ...base, ...overrides }, calls };
}

describe('ocrPdfInBucket', () => {
  it('startet die Erkennung auf der Datei im Bucket und liest das Ergebnis', async () => {
    const { d, calls } = deps();
    const pages = await ocrPdfInBucket('bucket', 'risikoobjekt/o/d-plan.pdf', 'ocr-ausgabe/o/d', d);
    expect(pages.map((p) => p.context?.pageNumber)).toEqual([2, 1]);
    const request = calls[0].data as { requests: Array<Record<string, any>> };
    expect(request.requests[0].inputConfig.gcsSource.uri).toBe('gs://bucket/risikoobjekt/o/d-plan.pdf');
    expect(request.requests[0].outputConfig.gcsDestination.uri).toBe('gs://bucket/ocr-ausgabe/o/d/');
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
    expect(d.deleteOutput).toHaveBeenCalledWith('ocr-ausgabe/o/d/');
  });

  it('meldet einen Fehler der Operation und räumt trotzdem auf', async () => {
    const { d } = deps({
      request: async <T,>(o: { method: string }) =>
        (o.method === 'POST'
          ? { name: 'operations/x' }
          : { done: true, error: { message: 'kaputt' } }) as T,
    });
    await expect(ocrPdfInBucket('b', 'p.pdf', 'out', d)).rejects.toBeInstanceOf(OcrError);
    expect(d.deleteOutput).toHaveBeenCalled();
  });

  it('bricht nach der Wartezeit ab', async () => {
    const { d } = deps({
      request: async <T,>(o: { method: string }) =>
        (o.method === 'POST' ? { name: 'operations/x' } : { done: false }) as T,
    });
    await expect(
      ocrPdfInBucket('b', 'p.pdf', 'out', d, { pollMs: 10, timeoutMs: 30 }),
    ).rejects.toThrow('zu lange');
  });

  it('wirft, wenn keine Seite erkannt wurde', async () => {
    const { d } = deps({ readOutput: async () => [JSON.stringify({ responses: [{ error: { message: 'x' } }] })] });
    await expect(ocrPdfInBucket('b', 'p.pdf', 'out', d)).rejects.toBeInstanceOf(OcrError);
  });
});

describe('ocrPdf', () => {
  /** Antwort von `files:annotate` für eine Datei mit `total` Seiten. */
  function annotate(total: number, pages: number[]) {
    return {
      responses: [
        {
          totalPages: total,
          responses: pages.map((n) => ({
            context: { pageNumber: n },
            fullTextAnnotation: { text: `seite ${n}` },
          })),
        },
      ],
    };
  }

  function smallDeps(response: unknown) {
    const { d, calls } = deps();
    const asyncRequest = d.request;
    d.request = async <T,>(o: { url: string; method: 'GET' | 'POST'; data?: unknown }) => {
      if (o.url.endsWith('/files:annotate')) {
        calls.push(o);
        return response as T;
      }
      return asyncRequest<T>(o);
    };
    d.readOutput = vi.fn(d.readOutput);
    return { d, calls };
  }

  it('liest kleine Pläne direkt, ohne Umweg über den Bucket', async () => {
    const { d, calls } = smallDeps(annotate(4, [1, 2, 3, 4]));
    const pages = await ocrPdf('bucket', 'risikoobjekt/o/d.pdf', 'out', d, { pageCount: 4 });
    expect(pages.map((p) => p.context?.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://eu-vision.googleapis.com/v1/files:annotate');
    const request = calls[0].data as { requests: Array<Record<string, any>> };
    expect(request.requests[0].inputConfig.gcsSource.uri).toBe('gs://bucket/risikoobjekt/o/d.pdf');
    expect(request.requests[0].pages).toEqual([1, 2, 3, 4]);
    expect(request.requests[0].features).toEqual([{ type: 'DOCUMENT_TEXT_DETECTION' }]);
    expect(d.readOutput).not.toHaveBeenCalled();
    expect(d.deleteOutput).not.toHaveBeenCalled();
  });

  it('versucht es bei unbekannter Seitenzahl direkt und fällt bei mehr als fünf Seiten zurück', async () => {
    const { d, calls } = smallDeps(annotate(7, [1, 2, 3, 4, 5]));
    const pages = await ocrPdf('bucket', 'p.pdf', 'out', d);
    expect((calls[0].data as { requests: Array<{ pages: number[] }> }).requests[0].pages).toEqual([
      1, 2, 3, 4, 5,
    ]);
    // Ergebnis aus dem asynchronen Weg (Fixture: Seiten 2 und 1).
    expect(pages.map((p) => p.context?.pageNumber)).toEqual([2, 1]);
    expect(calls.some((c) => c.url.endsWith('/files:asyncBatchAnnotate'))).toBe(true);
  });

  it('nimmt für große Pläne gleich den asynchronen Weg', async () => {
    const { d, calls } = smallDeps(annotate(1, [1]));
    await ocrPdf('bucket', 'p.pdf', 'out', d, { pageCount: 12 });
    expect(calls.some((c) => c.url.endsWith('/files:annotate'))).toBe(false);
    expect(calls[0].url).toBe('https://eu-vision.googleapis.com/v1/files:asyncBatchAnnotate');
  });

  it('meldet einen Fehler der Datei', async () => {
    const { d } = smallDeps({ responses: [{ error: { message: 'kaputt' } }] });
    await expect(ocrPdf('b', 'p.pdf', 'out', d, { pageCount: 2 })).rejects.toBeInstanceOf(OcrError);
  });

  it('wirft, wenn keine Seite erkannt wurde', async () => {
    const { d } = smallDeps({
      responses: [{ totalPages: 1, responses: [{ error: { message: 'x' } }] }],
    });
    await expect(ocrPdf('b', 'p.pdf', 'out', d, { pageCount: 1 })).rejects.toBeInstanceOf(OcrError);
  });
});
