/**
 * Melder in Brandschutzplänen finden und suchen — die reine Logik, ohne pdfjs,
 * ohne DOM. Hintergrund: docs/objektplaene.md.
 *
 * Eine Melderkennung steht im Plan als `Gruppe/Melder`, oft mit einem
 * Buchstaben als Zusatz (`4/01E`, das `E` kennzeichnet z.B. einen Melder in
 * der Zwischendecke). Die Nummern sind in der Textebene der CAD-Exporte als
 * eigene Textstücke enthalten — samt Position, und damit lässt sich ein
 * Melder ohne KI finden und im Plan markieren.
 */

/** Normiertes Rechteck auf der Seite: [x0, y0, x1, y1], 0..1, Ursprung oben links. */
export type Box = [number, number, number, number];

/** Ein gefundener Melder, so wie er am Dokument gespeichert wird. */
export interface MelderEntry {
  kennung: string;
  gruppe: number;
  melder: number;
  zusatz?: string;
  /** Seite, ab 1. */
  seite: number;
  box: Box;
}

export interface MelderMatch {
  kennung: string;
  gruppe: number;
  melder: number;
  zusatz?: string;
  /** Lage im untersuchten Text, für den Ausschnitt aus dem Textstück. */
  start: number;
  end: number;
}

export interface MelderQuery {
  gruppe: number;
  melder?: number;
}

/**
 * Gruppe mit bis zu drei Stellen, Melder mit bis zu zwei (eine Meldergruppe
 * fasst höchstens 32 Melder). Davor keine Ziffer und kein Schrägstrich,
 * danach weder Ziffer, Buchstabe noch Schrägstrich — so fallen
 * Telefonnummern (`02742/350`), Maßstäbe (`1/100`) und Daten (`17/05/2011`)
 * heraus.
 */
const MELDER_PATTERN = /(?<![\d/])(\d{1,3})\/(\d{1,2})([A-Z])?(?![\dA-Za-z/])/g;

export function findMelderInText(text: string): MelderMatch[] {
  const hits: MelderMatch[] = [];
  for (const m of text.matchAll(MELDER_PATTERN)) {
    const gruppe = Number(m[1]);
    const melder = Number(m[2]);
    if (gruppe < 1 || melder < 1) continue;
    const start = m.index ?? 0;
    hits.push({
      kennung: m[0],
      gruppe,
      melder,
      ...(m[3] ? { zusatz: m[3] } : {}),
      start,
      end: start + m[0].length,
    });
  }
  return hits;
}

/**
 * Liest eine Eingabe als Melder: „3/5", „3/05", „MG 3 M 5", „Meldergruppe 12
 * Melder 3" oder nur eine Gruppe („MG 12", „12"). Alles andere ist kein
 * Melder, sondern ein Suchbegriff für den Volltext.
 */
export function parseMelderQuery(input: string): MelderQuery | null {
  const normalized = input
    .toLowerCase()
    .replace(/meldergruppe|gruppe|mg/g, ' ')
    .replace(/melder|\bm(?=\s*\d)|\bm\b/g, ' ')
    .trim();
  const m = normalized.match(/^(\d{1,3})(?:\s*[/\-.\s]\s*(\d{1,2})\s*[a-z]?)?$/);
  if (!m) return null;
  const gruppe = Number(m[1]);
  if (gruppe < 1) return null;
  if (m[2] === undefined) return { gruppe };
  const melder = Number(m[2]);
  if (melder < 1) return null;
  return { gruppe, melder };
}

export function matchesMelderQuery(entry: MelderEntry, query: MelderQuery): boolean {
  if (entry.gruppe !== query.gruppe) return false;
  return query.melder === undefined || entry.melder === query.melder;
}

export interface PageTextHit {
  /** Seite, ab 1. */
  seite: number;
  count: number;
  snippet: string;
}

const SNIPPET_RADIUS = 40;

/** Volltextsuche über den gespeicherten Text je Seite. */
export function searchPageTexts(pages: string[], term: string): PageTextHit[] {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: PageTextHit[] = [];
  pages.forEach((text, i) => {
    const haystack = text.toLowerCase();
    let at = haystack.indexOf(needle);
    if (at < 0) return;
    const first = at;
    let count = 0;
    while (at >= 0) {
      count += 1;
      at = haystack.indexOf(needle, at + needle.length);
    }
    const from = Math.max(0, first - SNIPPET_RADIUS);
    const to = Math.min(text.length, first + needle.length + SNIPPET_RADIUS);
    const snippet =
      (from > 0 ? '…' : '') +
      text.slice(from, to).replace(/\s+/g, ' ').trim() +
      (to < text.length ? '…' : '');
    hits.push({ seite: i + 1, count, snippet });
  });
  return hits;
}

/** Ein Textstück, wie pdfjs es in `getTextContent()` liefert. */
export interface TextItemGeometry {
  /** Textmatrix samt Schriftgröße, im PDF-Koordinatensystem. */
  transform: number[];
  /** Breite entlang der Schreibrichtung. */
  width: number;
  height: number;
}

/** Anteil der Unterlänge an der Schrifthöhe — grob, reicht für die Markierung. */
const DESCENT = 0.25;

/**
 * Rechteck eines Textstücks (oder des Anteils `range` daran) auf der Seite,
 * normiert auf 0..1. `toViewport` ist die Umrechnung des Viewports von pdfjs
 * (`convertToViewportPoint`) — sie bringt die Drehung der Seite mit; die
 * Drehung des Texts steckt in der Textmatrix. Deshalb werden alle vier Ecken
 * umgerechnet und erst dann das umschließende Rechteck gebildet.
 */
export function textItemBox(
  item: TextItemGeometry,
  range: [number, number],
  toViewport: (x: number, y: number) => [number, number],
  size: { width: number; height: number },
): Box {
  const [a, b, c, d, e, f] = item.transform;
  const dirLen = Math.hypot(a, b) || 1;
  const upLen = Math.hypot(c, d) || 1;
  const dir = [a / dirLen, b / dirLen];
  const up = [c / upLen, d / upLen];
  const height = item.height > 0 ? item.height : upLen;
  const u0 = item.width * range[0];
  const u1 = item.width * range[1];
  const v0 = -height * DESCENT;
  const v1 = height;
  const corners = [
    [u0, v0],
    [u1, v0],
    [u0, v1],
    [u1, v1],
  ].map(([u, v]) =>
    toViewport(e + dir[0] * u + up[0] * v, f + dir[1] * u + up[1] * v),
  );
  const xs = corners.map((p) => p[0] / size.width);
  const ys = corners.map((p) => p[1] / size.height);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return [
    clamp(Math.min(...xs)),
    clamp(Math.min(...ys)),
    clamp(Math.max(...xs)),
    clamp(Math.max(...ys)),
  ];
}
