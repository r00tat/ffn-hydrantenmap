/**
 * Beschriftungen der 3D-Ansicht.
 *
 * Die Karte schreibt Höhen als DOM-Element an die Linie; in der Szene gibt es
 * kein DOM. Der Text wird deshalb auf ein Canvas gezeichnet und als Sprite
 * gehängt.
 */

/** Schriftgröße im Canvas. Die Größe im Bild setzt die Szene. */
const FONT_PX = 44;
const PADDING_X = 14;
const PADDING_Y = 8;

/**
 * Kontur um den Text statt eines Kastens dahinter.
 *
 * Ein Kasten deckt das Gelände zu, das die Zahl erklären soll. Eine dunkle
 * Kontur reicht, damit die Zahl über hellem Luftbild **und** über dunklem
 * Waldschatten steht — dieselbe Überlegung wie bei `contourLabelColor` in der
 * Karte, nur mit anderem Mittel.
 */
const OUTLINE = 'rgba(0, 0, 0, 0.85)';
const OUTLINE_PX = 6;

const font = (): string =>
  `bold ${FONT_PX}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Maße der Beschriftung; die Breite hängt am Text. */
export function labelSize(
  ctx: CanvasRenderingContext2D,
  text: string
): { width: number; height: number } {
  ctx.font = font();
  const measured = ctx.measureText(text).width;
  return {
    width: Math.ceil(measured + 2 * PADDING_X + OUTLINE_PX),
    height: FONT_PX + 2 * PADDING_Y + OUTLINE_PX,
  };
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.font = font();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = OUTLINE_PX;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2);
}

const cache = new Map<string, HTMLCanvasElement>();

/** Nur für Tests: den Vorrat leeren. */
export function clearLabelCache(): void {
  cache.clear();
}

/**
 * Die Beschriftung als Canvas, aus dem Vorrat oder neu gezeichnet.
 *
 * Der Vorrat trägt: dieselbe Höhe kommt in einem Ausschnitt vielfach vor, und
 * jede Zahl eigens gezeichnet wären ebenso viele Texturen.
 */
export function labelCanvas(text: string, color: string): HTMLCanvasElement {
  const key = `${text}|${color}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) return canvas;
  const { width, height } = labelSize(probe, text);
  canvas.width = width;
  canvas.height = height;
  // Nach dem Setzen der Maße ist der Kontext zurückgesetzt — die Schrift muss
  // erneut gesetzt werden, und genau das tut `drawLabel`.
  drawLabel(probe, text, color, width, height);
  cache.set(key, canvas);
  return canvas;
}
