/**
 * Aus einem Plan-PDF den Text je Seite und die Melder samt Lage gewinnen.
 * Die Erkennung selbst steckt in `melderIndex.ts`; dieses Modul kennt nur
 * die Schnittstelle von pdfjs. Die Bibliothek wird hereingereicht: im
 * Browser der Standard-Build samt Worker (`components/Objektplan/pdfPlanIndex.ts`),
 * auf dem Server und im Test der Legacy-Build (`server/objektplan/pdfjsNode.ts`).
 */
import { findMelderInText, textItemBox, type MelderEntry } from './melderIndex';

/**
 * Obergrenze des gespeicherten Texts je Dokument. Ein Firestore-Dokument
 * fasst 1 MiB; Melderliste und Metadaten brauchen daneben Platz.
 */
export const MAX_TEXT_CHARS = 600_000;

export interface PdfPlanIndex {
  seiten: number;
  seitenText: string[];
  melder: MelderEntry[];
  textGekuerzt: boolean;
}

interface PdfjsTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PdfjsViewport {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

export interface PdfjsPage {
  getViewport(params: { scale: number }): PdfjsViewport;
  getTextContent(): Promise<{ items: PdfjsTextItem[] }>;
}

export interface PdfjsLike {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<PdfjsPage>;
      destroy?: () => Promise<void>;
    }>;
  };
}

/** Melder eines Textstücks einer Seite, mit normierter Box. */
export function melderOnPage(
  items: PdfjsTextItem[],
  viewport: PdfjsViewport,
  seite: number,
): MelderEntry[] {
  const toViewport = (x: number, y: number): [number, number] => {
    const [vx, vy] = viewport.convertToViewportPoint(x, y);
    return [vx, vy];
  };
  const size = { width: viewport.width, height: viewport.height };
  const result: MelderEntry[] = [];
  for (const item of items) {
    const text = item.str ?? '';
    if (!text || !item.transform) continue;
    for (const hit of findMelderInText(text)) {
      result.push({
        kennung: hit.kennung,
        gruppe: hit.gruppe,
        melder: hit.melder,
        ...(hit.zusatz ? { zusatz: hit.zusatz } : {}),
        seite,
        box: textItemBox(
          {
            transform: item.transform,
            width: item.width ?? 0,
            height: item.height ?? 0,
          },
          [hit.start / text.length, hit.end / text.length],
          toViewport,
          size,
        ),
      });
    }
  }
  return result;
}

function pageText(items: PdfjsTextItem[]): string {
  return items
    .map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : ' '))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function indexPdf(
  data: Uint8Array,
  loadPdfjs: () => Promise<PdfjsLike>,
  maxTextChars: number = MAX_TEXT_CHARS,
): Promise<PdfPlanIndex> {
  const pdfjs = await loadPdfjs();
  // pdfjs übernimmt den Puffer in den Worker und lässt ihn danach leer
  // zurück — der Aufrufer braucht die Bytes aber noch für den Upload.
  const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
  const seitenText: string[] = [];
  const melder: MelderEntry[] = [];
  let remaining = maxTextChars;
  let textGekuerzt = false;
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      melder.push(...melderOnPage(items, page.getViewport({ scale: 1 }), n));
      let text = pageText(items);
      if (text.length > remaining) {
        text = text.slice(0, Math.max(0, remaining));
        textGekuerzt = true;
      }
      remaining -= text.length;
      seitenText.push(text);
    }
  } finally {
    await doc.destroy?.();
  }
  return { seiten: doc.numPages, seitenText, melder, textGekuerzt };
}
