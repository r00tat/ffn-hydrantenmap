/**
 * Zuschneiden eines Screenshots auf den ausgewählten Bereich.
 *
 * Die Auswahl entsteht in CSS-Pixeln über einem Bild, das mit
 * `object-fit: contain` angezeigt wird — also verkleinert (oder vergrößert)
 * und mit Rändern oben/unten bzw. links/rechts. `mapSelectionToImage` rechnet
 * sie in Pixel des Originalbilds um; die Rechnung ist rein und getestet, das
 * Zeichnen auf das Canvas (`cropImageBlob`) ist der einzige Teil mit DOM.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Kleinste Auswahl in angezeigten Pixeln. Darunter war es ein Antippen oder
 * ein Verwackeln, kein Aufziehen.
 */
export const MIN_SELECTION_PX = 8;

/** Rechteck aus zwei Punkten, egal in welche Richtung gezogen wurde. */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function normalizeSigned(rect: Rect): Rect {
  return normalizeRect(
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  );
}

/**
 * Wo das Bild in einer Box mit `object-fit: contain` (zentriert) tatsächlich
 * liegt, in Koordinaten der Box.
 */
export function containRect(box: Size, natural: Size): Rect {
  if (box.width <= 0 || box.height <= 0 || natural.width <= 0 || natural.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}

/** Schneidet `rect` auf `bounds` zu; ohne Überschneidung Breite/Höhe 0. */
export function clampRect(rect: Rect, bounds: Rect): Rect {
  const left = Math.max(rect.x, bounds.x);
  const top = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Auswahl in angezeigten CSS-Pixeln (relativ zur Box des `<img>`, Breite und
 * Höhe dürfen negativ sein) → ganzzahliges Rechteck in Pixeln des
 * Originalbilds. `null`, wenn nach dem Zuschneiden auf das sichtbare Bild
 * weniger als `minSize` angezeigte Pixel übrig bleiben.
 */
export function mapSelectionToImage(
  selection: Rect,
  box: Size,
  natural: Size,
  { minSize = MIN_SELECTION_PX }: { minSize?: number } = {},
): Rect | null {
  const content = containRect(box, natural);
  if (content.width <= 0 || content.height <= 0) return null;

  const visible = clampRect(normalizeSigned(selection), content);
  if (visible.width < minSize || visible.height < minSize) return null;

  const scale = content.width / natural.width;
  const left = Math.max(0, Math.round((visible.x - content.x) / scale));
  const top = Math.max(0, Math.round((visible.y - content.y) / scale));
  const right = Math.min(
    natural.width,
    Math.round((visible.x + visible.width - content.x) / scale),
  );
  const bottom = Math.min(
    natural.height,
    Math.round((visible.y + visible.height - content.y) / scale),
  );
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type DecodedImage = {
  source: CanvasImageSource;
  release: () => void;
};

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, release: () => bitmap.close() };
  }
  // Ältere WebViews ohne createImageBitmap.
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    return { source: img, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Schneidet `rect` (Pixel des Originalbilds) aus dem Bild aus und liefert ein
 * PNG. `null`, wenn der Browser das Bild nicht dekodieren oder kein Canvas
 * liefern kann.
 */
export async function cropImageBlob(blob: Blob, rect: Rect): Promise<Blob | null> {
  let decoded: DecodedImage | undefined;
  try {
    decoded = await decodeImage(blob);
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('bug-report: no 2d canvas context for cropping');
      return null;
    }
    ctx.drawImage(
      decoded.source,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/png'),
    );
  } catch (err) {
    console.warn('bug-report: cropping the screenshot failed', err);
    return null;
  } finally {
    decoded?.release();
  }
}
