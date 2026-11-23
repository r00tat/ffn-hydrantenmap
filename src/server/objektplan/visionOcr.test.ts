import { describe, expect, it, vi } from 'vitest';
import { ocrPdfInBucket, OcrError, type VisionOcrDeps } from './visionOcr';

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
