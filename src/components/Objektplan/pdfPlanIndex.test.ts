// @vitest-environment jsdom
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { indexPdf, MAX_TEXT_CHARS } from './pdfPlanIndex';

/** Der Legacy-Build läuft unter Node (siehe fahrtenbuchPdfImport.integration.test.ts). */
async function loadPdfjsForNode() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs as never;
}

async function buildPlan(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Seite 1: 400 × 200, waagrechter und senkrechter Melder, dazu Legende.
  const p1 = doc.addPage([400, 200]);
  p1.drawText('3/05E', { x: 100, y: 100, size: 10, font });
  p1.drawText('6/01E', { x: 300, y: 50, size: 10, font, rotate: degrees(90) });
  p1.drawText('HEIZRAUM', { x: 20, y: 20, size: 8, font });

  // Seite 2: gedreht um 90°, wie ein quer eingescanntes A3-Blatt.
  const p2 = doc.addPage([400, 200]);
  p2.setRotation(degrees(90));
  p2.drawText('12/3', { x: 50, y: 150, size: 10, font });

  return doc.save();
}

describe('indexPdf', () => {
  it('liest Seiten, Text und Melder samt Lage', async () => {
    const result = await indexPdf(await buildPlan(), loadPdfjsForNode);

    expect(result.seiten).toBe(2);
    expect(result.seitenText[0]).toContain('HEIZRAUM');
    expect(result.melder.map((m) => [m.kennung, m.seite])).toEqual([
      ['3/05E', 1],
      ['6/01E', 1],
      ['12/3', 2],
    ]);

    // 3/05E beginnt bei x=100 von 400, Grundlinie bei y=100 von 200 (oben 0).
    const [x0, y0, x1, y1] = result.melder[0].box;
    expect(x0).toBeCloseTo(0.25, 2);
    expect(x1).toBeGreaterThan(0.3);
    expect(x1).toBeLessThan(0.33);
    expect(y0).toBeLessThan(0.5);
    expect(y1).toBeGreaterThan(0.5);

    // Senkrechter Text: schmal und hoch.
    const v = result.melder[1].box;
    expect(v[2] - v[0]).toBeLessThan(v[3] - v[1]);
    expect(v[0]).toBeLessThan(0.75);
    expect(v[2]).toBeGreaterThan(0.72);
  });

  it('rechnet die Drehung der Seite mit ein', async () => {
    const result = await indexPdf(await buildPlan(), loadPdfjsForNode);
    // Nach 90° im Uhrzeigersinn ist die Seite 200 breit und 400 hoch; ein
    // Punkt (x, y) im PDF landet bei (y, x) im Viewport (Ursprung oben links).
    const [x0, y0, x1, y1] = result.melder[2].box;
    expect((x0 + x1) / 2).toBeCloseTo(150 / 200, 1);
    expect((y0 + y1) / 2).toBeGreaterThan(50 / 400);
    expect((y0 + y1) / 2).toBeLessThan(90 / 400);
  });

  it('kürzt sehr langen Text', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([2000, 2000]);
    const line = 'x'.repeat(300);
    for (let i = 0; i < 40; i += 1) {
      page.drawText(line, { x: 0, y: 10 + i * 12, size: 4, font });
    }
    const result = await indexPdf(await doc.save(), loadPdfjsForNode, 5000);
    expect(result.seitenText.join('').length).toBeLessThanOrEqual(5000);
    expect(result.textGekuerzt).toBe(true);
    expect(MAX_TEXT_CHARS).toBeGreaterThan(5000);
  });
});
