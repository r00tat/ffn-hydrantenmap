/**
 * Die Marken der 3D-Ansicht.
 *
 * Die Kartensymbole taugen in der Szene nicht: sie sind für die Aufsicht
 * gezeichnet, teils als Nadel mit der Spitze als Ankerpunkt, teils als 24 px
 * großes Quadrat ohne eigenen Rand. Schräg von der Seite, vor einem
 * Luftbild als Untergrund, verschwinden sie darin.
 *
 * Deshalb wird hier je Symbol eine eigene Marke gezeichnet: eine weiße
 * Nadel mit dunklem Rand und Schlagschatten, das Kartensymbol mittig darin.
 * Das Symbol bleibt damit dasselbe wie in der Karte — nur der Träger ist ein
 * anderer.
 */

/** Kantenmaße der gezeichneten Marke. Die Spitze sitzt unten in der Mitte. */
export const BADGE_W = 128;
export const BADGE_H = 160;

/** Mittelpunkt und Radius der Platte. */
const PLATE_X = BADGE_W / 2;
const PLATE_Y = 60;
const PLATE_R = 50;
/** Spitze, auf die die Marke zeigt — zugleich ihr Ankerpunkt. */
const TIP_Y = 152;

const RING = '#263238';
const PLATE = '#ffffff';

/** Seitenverhältnis der Marke — die Szene braucht es für die Sprite-Größe. */
export const BADGE_ASPECT = BADGE_W / BADGE_H;

/**
 * Die Marke zeichnen.
 *
 * Ohne Symbol bleibt ein Punkt stehen: eine leere weiße Platte wäre von einem
 * Ladefehler nicht zu unterscheiden, ein leerer Fleck im Bild dagegen schon.
 */
export function drawMarkerBadge(
  ctx: CanvasRenderingContext2D,
  icon?: CanvasImageSource,
  iconWidth = 0,
  iconHeight = 0
): void {
  ctx.clearRect(0, 0, BADGE_W, BADGE_H);
  ctx.save();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = PLATE;
  ctx.strokeStyle = RING;
  ctx.lineWidth = 6;

  // Erst die Spitze, dann die Platte darüber: so verdeckt die Platte die obere
  // Kante des Dreiecks, und der Umriss läuft außen durch.
  ctx.beginPath();
  ctx.moveTo(PLATE_X - 20, PLATE_Y + 28);
  ctx.lineTo(PLATE_X + 20, PLATE_Y + 28);
  ctx.lineTo(PLATE_X, TIP_Y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(PLATE_X, PLATE_Y, PLATE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  if (!icon || iconWidth <= 0 || iconHeight <= 0) {
    ctx.fillStyle = RING;
    ctx.beginPath();
    ctx.arc(PLATE_X, PLATE_Y, 14, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Seitenverhältnis halten: die Symbole sind teils quadratisch (24 × 24),
  // teils hochkant (30 × 30 mit Nadelspitze). Verzerrt wären sie nicht mehr
  // dieselben wie in der Karte.
  const box = PLATE_R * 1.4;
  const scale = Math.min(box / iconWidth, box / iconHeight);
  const w = iconWidth * scale;
  const h = iconHeight * scale;
  ctx.drawImage(icon, PLATE_X - w / 2, PLATE_Y - h / 2, w, h);
}

/**
 * Geladene Marken je Symbol-URL.
 *
 * Ein Einsatz hat leicht dreißig Objekte desselben Typs; ohne den Vorrat wäre
 * jedes davon ein eigener Bildabruf und eine eigene Textur.
 */
const cache = new Map<string, Promise<HTMLCanvasElement>>();

/** Nur für Tests: den Vorrat leeren. */
export function clearMarkerBadgeCache(): void {
  cache.clear();
}

/**
 * Frist, nach der ein Symbol als nicht geladen gilt.
 *
 * Ohne sie hinge die Marke an einem Abruf, der weder `load` noch `error`
 * meldet — und weil das Bild erst nach dem Symbol gezeichnet wird, bliebe die
 * Marke **unsichtbar**. Ein Objekt, das im Gelände fehlt, ist schlimmer als
 * eines ohne sein Symbol.
 */
const ICON_TIMEOUT_MS = 5_000;

function loadIcon(url: string): Promise<HTMLImageElement | undefined> {
  if (!url) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(undefined), ICON_TIMEOUT_MS);
    const done = (result?: HTMLImageElement) => {
      clearTimeout(timer);
      resolve(result);
    };
    // Ohne `crossOrigin` färbt ein fremdes Symbol das Canvas ein, und der
    // Texturupload nach WebGL wirft. Die Symbole liegen zwar auf derselben
    // Origin oder als Data-URL vor, aber ein eigenes Symbol an der Marke darf
    // die ganze Ansicht nicht kippen.
    image.crossOrigin = 'anonymous';
    image.onload = () => done(image);
    image.onerror = () => done(undefined);
    image.src = url;
  });
}

/** Die Marke zu einem Symbol, aus dem Vorrat oder neu gezeichnet. */
export function markerBadge(iconUrl: string): Promise<HTMLCanvasElement> {
  const cached = cache.get(iconUrl);
  if (cached) return cached;

  const job = (async () => {
    const canvas = document.createElement('canvas');
    canvas.width = BADGE_W;
    canvas.height = BADGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const icon = await loadIcon(iconUrl);
    drawMarkerBadge(ctx, icon, icon?.naturalWidth, icon?.naturalHeight);
    return canvas;
  })();

  cache.set(iconUrl, job);
  return job;
}
