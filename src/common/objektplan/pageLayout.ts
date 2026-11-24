/**
 * Anordnung der Seiten im Plan-Viewer: alle Seiten untereinander, jede auf
 * die Breite eingepasst. Gerendert werden nur die Seiten in und um den
 * sichtbaren Bereich — ein Plan hat bis zu 25 A0-Seiten, jede als Canvas im
 * Speicher wäre auf dem Handy zu viel.
 */

export interface PageSize {
  width: number;
  height: number;
}

export interface PlacedPage {
  top: number;
  width: number;
  height: number;
}

export interface PageLayout {
  pages: PlacedPage[];
  totalHeight: number;
}

export function layoutPages(
  sizes: PageSize[],
  containerWidth: number,
  zoom: number,
  gap: number,
): PageLayout {
  if (containerWidth <= 0) return { pages: [], totalHeight: 0 };
  const pages: PlacedPage[] = [];
  let top = 0;
  for (const size of sizes) {
    const width = containerWidth * zoom;
    const height = (size.height / size.width) * width;
    pages.push({ top, width, height });
    top += height + gap;
  }
  const last = pages.at(-1);
  return { pages, totalHeight: last ? last.top + last.height : 0 };
}

/** Seite (ab 1), die in der Mitte des sichtbaren Bereichs liegt. */
export function pageAtScroll(
  layout: PageLayout,
  scrollTop: number,
  viewportHeight: number,
): number {
  const middle = scrollTop + viewportHeight / 2;
  let result = 1;
  layout.pages.forEach((p, i) => {
    if (p.top <= middle) result = i + 1;
  });
  return result;
}

/** Seiten (ab 1), die zu rendern sind: sichtbar plus eine Bildschirmhöhe davor und danach. */
export function pagesToRender(
  layout: PageLayout,
  scrollTop: number,
  viewportHeight: number,
): number[] {
  const from = scrollTop - viewportHeight;
  const to = scrollTop + 2 * viewportHeight;
  return layout.pages
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => p.top + p.height > from && p.top < to)
    .map(({ n }) => n);
}

/** Höhe in px, auf die ein Suchtreffer beim Sprung vergrößert wird. */
const MARK_TARGET_PX = 36;
/** Weiter zoomt ein Sprung nicht; der Benutzer kann danach selbst weiter. */
const MARK_MAX_ZOOM = 4;

/**
 * Zoom für den Sprung zu einem Treffer: Die Markierung soll lesbar hoch sein.
 * Auf einem A0-Plan ist eine Melderkennung bei eingepasster Breite nur wenige
 * Pixel hoch. Nie kleiner als eingepasst.
 *
 * @param box normierte Markierung `[x0, y0, x1, y1]`
 * @param fitPageHeight Höhe der Seite in px bei Zoom 1
 */
export function zoomForMark(
  box: readonly [number, number, number, number],
  fitPageHeight: number,
): number {
  const height = (box[3] - box[1]) * fitPageHeight;
  if (!(height > 0)) return 1;
  return Math.min(Math.max(MARK_TARGET_PX / height, 1), MARK_MAX_ZOOM);
}

/**
 * Wohin ein Punkt der Spalte nach dem Zoomen wandert: auf dieselbe Stelle
 * derselben Seite. Waagrecht wächst er mit der Seitenbreite, senkrecht mit
 * der Seite, in der er liegt — der Abstand zwischen den Seiten wächst nicht
 * mit. So bleibt beim Zwei-Finger-Zoom die Stelle zwischen den Fingern stehen.
 */
export function mapPointBetweenLayouts(
  from: PageLayout,
  to: PageLayout,
  x: number,
  y: number,
): { x: number; y: number } {
  if (from.pages.length === 0 || to.pages.length === 0) return { x, y };
  let i = from.pages.findIndex((p, n) => {
    const next = from.pages[n + 1];
    return y < (next ? next.top : Infinity);
  });
  if (i < 0) i = from.pages.length - 1;
  const a = from.pages[i];
  const b = to.pages[Math.min(i, to.pages.length - 1)];
  const scaleX = a.width > 0 ? b.width / a.width : 1;
  const offset = y - a.top;
  // Im Abstand unter der Seite bleibt der Versatz unverändert.
  const mappedY =
    offset <= a.height && a.height > 0
      ? b.top + (offset / a.height) * b.height
      : b.top + b.height + (offset - a.height);
  return { x: x * scaleX, y: mappedY };
}
