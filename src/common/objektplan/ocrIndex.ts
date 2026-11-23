/**
 * Index eines gescannten Plans aus der Texterkennung von Cloud Vision
 * (`DOCUMENT_TEXT_DETECTION`). Liefert dieselbe Form wie `indexPdf` aus der
 * Textebene, damit Suche und Melder-Markierung nichts davon merken.
 * Hintergrund: docs/objektplaene.md, „Texterkennung (OCR)".
 *
 * Melder werden über die erkannten Zeichen gesucht, nicht über den Seitentext:
 * Jedes Zeichen trägt seine Box, und der Treffer bekommt die Hülle seiner
 * Zeichen. Vision trennt `4/01E` gern in `4`, `/` und `01E` — ohne
 * Leerzeichen dazwischen, darum fügen sich die Teile wieder zusammen.
 */
import type { ObjektDokument } from './objektDokument';
import { MAX_TEXT_CHARS, type PdfPlanIndex } from './pdfIndex';
import { findMelderInText, type Box, type MelderEntry } from './melderIndex';

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionBoundingPoly {
  vertices?: VisionVertex[];
  normalizedVertices?: VisionVertex[];
}

interface VisionSymbol {
  text?: string;
  boundingBox?: VisionBoundingPoly;
  property?: { detectedBreak?: { type?: string } };
}

interface VisionPage {
  width?: number;
  height?: number;
  blocks?: Array<{
    paragraphs?: Array<{
      words?: Array<{ symbols?: VisionSymbol[]; boundingBox?: VisionBoundingPoly }>;
    }>;
  }>;
}

/** Ein Eintrag aus `responses` der Vision-Antwort — eine Seite. */
export interface VisionPageResponse {
  context?: { pageNumber?: number };
  fullTextAnnotation?: { text?: string; pages?: VisionPage[] };
  error?: { code?: number; message?: string };
}

const BREAKS: Record<string, string> = {
  SPACE: ' ',
  SURE_SPACE: ' ',
  EOL_SURE_SPACE: '\n',
  LINE_BREAK: '\n',
  HYPHEN: '\n',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

function normalizedBox(poly: VisionBoundingPoly | undefined, page: VisionPage): Box | undefined {
  let points: Array<[number, number]>;
  if (poly?.normalizedVertices?.length) {
    points = poly.normalizedVertices.map((v) => [v.x ?? 0, v.y ?? 0]);
  } else if (poly?.vertices?.length && page.width && page.height) {
    points = poly.vertices.map((v) => [(v.x ?? 0) / page.width!, (v.y ?? 0) / page.height!]);
  } else {
    return undefined;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [
    clamp(Math.min(...xs)),
    clamp(Math.min(...ys)),
    clamp(Math.max(...xs)),
    clamp(Math.max(...ys)),
  ];
}

function union(boxes: Box[]): Box {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/** Melder eines Absatzes: Text aus den Zeichen, je Zeichen seine Box. */
function melderOnOcrPage(page: VisionPage, seite: number): MelderEntry[] {
  const result: MelderEntry[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      let text = '';
      // Box je Zeichenposition im Text; Trenner haben keine.
      const boxes: Array<Box | undefined> = [];
      for (const word of paragraph.words ?? []) {
        const wordBox = normalizedBox(word.boundingBox, page);
        for (const symbol of word.symbols ?? []) {
          const chars = symbol.text ?? '';
          const box = normalizedBox(symbol.boundingBox, page) ?? wordBox;
          for (const ch of chars) {
            text += ch;
            boxes.push(box);
          }
          const brk = BREAKS[symbol.property?.detectedBreak?.type ?? ''];
          if (brk) {
            text += brk;
            boxes.push(undefined);
          }
        }
      }
      for (const hit of findMelderInText(text)) {
        const hitBoxes = boxes.slice(hit.start, hit.end).filter((b): b is Box => !!b);
        if (hitBoxes.length === 0) continue;
        result.push({
          kennung: hit.kennung,
          gruppe: hit.gruppe,
          melder: hit.melder,
          ...(hit.zusatz ? { zusatz: hit.zusatz } : {}),
          seite,
          box: union(hitBoxes),
        });
      }
    }
  }
  return result;
}

export function ocrIndexFromResponses(
  responses: VisionPageResponse[],
  maxTextChars: number = MAX_TEXT_CHARS,
): PdfPlanIndex {
  const sorted = [...responses].sort(
    (a, b) => (a.context?.pageNumber ?? 0) - (b.context?.pageNumber ?? 0),
  );
  const seitenText: string[] = [];
  const melder: MelderEntry[] = [];
  let remaining = maxTextChars;
  let textGekuerzt = false;
  sorted.forEach((response, i) => {
    const seite = response.context?.pageNumber ?? i + 1;
    const annotation = response.fullTextAnnotation;
    for (const page of annotation?.pages ?? []) melder.push(...melderOnOcrPage(page, seite));
    let text = (annotation?.text ?? '').trim();
    if (text.length > remaining) {
      text = text.slice(0, Math.max(0, remaining));
      textGekuerzt = true;
    }
    remaining -= text.length;
    seitenText.push(text);
  });
  return { seiten: sorted.length, seitenText, melder, textGekuerzt };
}

/**
 * Übernimmt das Ergebnis der Texterkennung ins Dokument. Bleibt der Text leer
 * (ein Foto ohne Schrift), bleibt es bei `ohneText` — vermerkt wird der
 * Versuch trotzdem, damit niemand ihn wiederholt.
 */
export function withOcrIndex(dokument: ObjektDokument, index: PdfPlanIndex): ObjektDokument {
  const hasText = index.seitenText.some((t) => t.trim().length > 0);
  return {
    ...dokument,
    indexStatus: hasText ? 'ok' : 'ohneText',
    seiten: index.seiten || dokument.seiten,
    seitenText: index.seitenText,
    melder: index.melder,
    ocr: true,
    ...(index.textGekuerzt ? { textGekuerzt: true } : {}),
  };
}
