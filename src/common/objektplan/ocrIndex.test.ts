import { describe, expect, it } from 'vitest';
import type { ObjektDokument } from './objektDokument';
import { ocrIndexFromResponses, withOcrIndex, type VisionPageResponse } from './ocrIndex';

/** Ein Wort aus Zeichen, jedes Zeichen 0,01 breit, ab `x` auf Höhe `y`. */
function word(text: string, x: number, y: number, breakAfter?: string) {
  const symbols = [...text].map((ch, i) => ({
    text: ch,
    boundingBox: {
      normalizedVertices: [
        { x: x + i * 0.01, y },
        { x: x + (i + 1) * 0.01, y },
        { x: x + (i + 1) * 0.01, y: y + 0.02 },
        { x: x + i * 0.01, y: y + 0.02 },
      ],
    },
    ...(i === text.length - 1 && breakAfter
      ? { property: { detectedBreak: { type: breakAfter } } }
      : {}),
  }));
  return { symbols };
}

function page(pageNumber: number, text: string, words: ReturnType<typeof word>[]): VisionPageResponse {
  return {
    context: { pageNumber },
    fullTextAnnotation: {
      text,
      pages: [{ width: 1000, height: 700, blocks: [{ paragraphs: [{ words }] }] }],
    },
  };
}

describe('ocrIndexFromResponses', () => {
  it('liefert Text je Seite in Seitenreihenfolge', () => {
    const index = ocrIndexFromResponses([
      page(2, 'Zweite Seite', []),
      page(1, 'Erste Seite', []),
    ]);
    expect(index.seiten).toBe(2);
    expect(index.seitenText).toEqual(['Erste Seite', 'Zweite Seite']);
    expect(index.textGekuerzt).toBe(false);
  });

  it('findet Melder über getrennt erkannte Zeichen und markiert sie', () => {
    // Vision trennt „4/01E“ oft in „4“, „/“ und „01E“ ohne Leerzeichen.
    const index = ocrIndexFromResponses([
      page(1, 'Melder 4/01E', [
        word('Melder', 0.1, 0.5, 'SPACE'),
        word('4', 0.2, 0.5),
        word('/', 0.21, 0.5),
        word('01E', 0.22, 0.5, 'LINE_BREAK'),
      ]),
    ]);
    expect(index.melder).toHaveLength(1);
    const [m] = index.melder;
    expect(m).toMatchObject({ kennung: '4/01E', gruppe: 4, melder: 1, zusatz: 'E', seite: 1 });
    expect(m.box[0]).toBeCloseTo(0.2);
    expect(m.box[1]).toBeCloseTo(0.5);
    expect(m.box[2]).toBeCloseTo(0.25);
    expect(m.box[3]).toBeCloseTo(0.52);
  });

  it('trennt Wörter an Leerzeichen, damit keine Melder entstehen', () => {
    const index = ocrIndexFromResponses([
      page(1, '12 /3', [word('12', 0.1, 0.1, 'SPACE'), word('/3', 0.2, 0.1)]),
    ]);
    expect(index.melder).toEqual([]);
  });

  it('rechnet Pixelkoordinaten auf die Seitengröße um', () => {
    const response = page(1, '7/2', []);
    response.fullTextAnnotation!.pages![0].blocks![0].paragraphs![0].words = [
      {
        symbols: [
          { text: '7', boundingBox: { vertices: [{ x: 100, y: 70 }, { x: 110, y: 70 }, { x: 110, y: 84 }, { x: 100, y: 84 }] } },
          { text: '/', boundingBox: { vertices: [{ x: 110, y: 70 }, { x: 120, y: 70 }, { x: 120, y: 84 }, { x: 110, y: 84 }] } },
          { text: '2', boundingBox: { vertices: [{ x: 120, y: 70 }, { x: 130, y: 70 }, { x: 130, y: 84 }, { x: 120, y: 84 }] } },
        ],
      },
    ];
    const [m] = ocrIndexFromResponses([response]).melder;
    expect(m.box[0]).toBeCloseTo(0.1);
    expect(m.box[1]).toBeCloseTo(0.1);
    expect(m.box[2]).toBeCloseTo(0.13);
    expect(m.box[3]).toBeCloseTo(0.12);
  });

  it('kürzt den Text an der Obergrenze', () => {
    const index = ocrIndexFromResponses([page(1, 'abcdef', []), page(2, 'ghij', [])], 8);
    expect(index.seitenText).toEqual(['abcdef', 'gh']);
    expect(index.textGekuerzt).toBe(true);
  });

  it('übersteht Seiten ohne erkannten Text', () => {
    const index = ocrIndexFromResponses([{ context: { pageNumber: 1 } }]);
    expect(index).toEqual({ seiten: 1, seitenText: [''], melder: [], textGekuerzt: false });
  });
});

describe('withOcrIndex', () => {
  const dokument: ObjektDokument = {
    id: 'd1',
    name: 'scan.pdf',
    contentType: 'application/pdf',
    storagePath: 'risikoobjekt/o/d1-scan.pdf',
    size: 10,
    sha256: 'x',
    indexStatus: 'ohneText',
    seiten: 2,
    createdAt: '',
    createdBy: '',
  };

  it('macht aus einem Scan mit erkanntem Text ein durchsuchbares Dokument', () => {
    const result = withOcrIndex(dokument, { seiten: 2, seitenText: ['a', 'b'], melder: [], textGekuerzt: false });
    expect(result).toMatchObject({ indexStatus: 'ok', ocr: true, seitenText: ['a', 'b'] });
  });

  it('bleibt ohne Text, merkt sich aber den Versuch', () => {
    const result = withOcrIndex(dokument, { seiten: 2, seitenText: ['', ''], melder: [], textGekuerzt: false });
    expect(result).toMatchObject({ indexStatus: 'ohneText', ocr: true });
  });
});
