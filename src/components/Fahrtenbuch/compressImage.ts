/**
 * Verkleinert ein Foto vor dem Hochladen.
 *
 * Der Grund ist das Gerät, mit dem ein Mangel gemeldet wird: Ein Handyfoto ist
 * schnell 5 MB groß, und der Gerätewart lädt es später über eine
 * Mobilverbindung wieder herunter. Für „Blinker hinten links gebrochen" reicht
 * die lange Kante von 1600 Pixeln — das ist immer noch mehr, als jeder
 * Bildschirm hier zeigt.
 */

/** Lange Kante des verkleinerten Bildes. */
export const MAX_IMAGE_DIMENSION = 1600;

/** JPEG-Qualität. Darunter werden Kanten sichtbar matschig. */
export const IMAGE_QUALITY = 0.82;

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Die Zielgröße unter Beibehaltung des Seitenverhältnisses. Ein bereits
 * kleines Bild wird nicht hochgerechnet — das kostete Bytes ohne einen einzigen
 * zusätzlichen Bildpunkt.
 */
export function scaledDimensions(
  width: number,
  height: number,
  max: number = MAX_IMAGE_DIMENSION,
): Dimensions {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Ersetzt die Endung, weil aus einem HEIC/PNG hier ein JPEG wird. */
export function jpegFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '');
  return `${base || 'bild'}.jpg`;
}

function canCompress(): boolean {
  return (
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

export interface CompressedImage {
  blob: Blob;
  fileName: string;
  contentType: string;
}

/**
 * Verkleinert das Bild; gibt bei jedem Hindernis das Original zurück.
 *
 * Ein Bild, das der Browser nicht dekodieren kann (HEIC auf einem Desktop,
 * eine kaputte Datei), soll den Upload nicht verhindern — lieber 5 MB im
 * Storage als ein Mangel ohne Foto. Ein Ergebnis, das größer ist als das
 * Original, wird verworfen: Bei einem kleinen Screenshot rechnet die
 * JPEG-Kodierung sonst Bytes obendrauf.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const original: CompressedImage = {
    blob: file,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
  };
  if (!file.type.startsWith('image/') || !canCompress()) return original;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height);
    if (width === 0 || height === 0) {
      bitmap.close?.();
      return original;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close?.();
      return original;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY),
    );
    if (!blob || blob.size >= file.size) return original;

    return {
      blob,
      fileName: jpegFileName(file.name),
      contentType: 'image/jpeg',
    };
  } catch (err) {
    console.warn('mangel: Bild nicht verkleinert, lade das Original', err);
    return original;
  }
}
