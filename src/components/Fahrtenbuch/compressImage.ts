/**
 * Verkleinert ein Foto vor dem Hochladen.
 *
 * Der Grund ist das Gerät, mit dem ein Mangel gemeldet wird: Ein Handyfoto ist
 * schnell 5 MB groß, und der Gerätewart lädt es später über eine
 * Mobilverbindung wieder herunter. Für „Blinker hinten links gebrochen" reicht
 * die lange Kante von 1600 Pixeln — das ist immer noch mehr, als jeder
 * Bildschirm hier zeigt.
 */

import {
  isAllowedMangelImageType,
  MANGEL_MAX_IMAGE_BYTES,
} from '../../common/mangel';

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

/**
 * Bekannte Bildendungen für den Fall, dass der Browser keinen MIME-Typ meldet.
 *
 * Das kommt vor — manche Android-Sharetargets und Dateimanager liefern eine
 * Datei mit leerem `type`. Ohne diese Tabelle ginge sie als
 * `application/octet-stream` in den Upload und liefe in die
 * Contenttype-Bedingung der `storage.rules`, obwohl es ein Foto ist.
 */
const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Der Bildtyp nach Endung; `undefined`, wenn die Endung nichts hergibt. */
export function imageTypeFromName(fileName: string): string | undefined {
  const extension = /\.([^./\\]+)$/.exec(fileName ?? '')?.[1];
  return extension ? EXTENSION_TYPES[extension.toLowerCase()] : undefined;
}

/** Der Typ, unter dem die Datei hochgeladen wird. */
function contentTypeOf(file: File): string {
  return file.type || imageTypeFromName(file.name) || 'application/octet-stream';
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
  const contentType = contentTypeOf(file);
  const original: CompressedImage = {
    blob: file,
    fileName: file.name,
    contentType,
  };
  if (!contentType.startsWith('image/') || !canCompress()) return original;

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

/** Warum ein Bild nicht hochgeladen wurde. Zugleich der Übersetzungsschlüssel. */
export type MangelImageRejection = 'imageTooLarge' | 'imageTypeUnsupported';

/**
 * Ein Bild, das die `storage.rules` ablehnen würden. Trägt den Dateinamen mit:
 * Wer fünf Fotos angehängt hat, muss wissen, welches davon gemeint ist.
 */
export class MangelImageError extends Error {
  constructor(
    readonly reason: MangelImageRejection,
    readonly fileName: string,
  ) {
    super(`${reason}: ${fileName}`);
    this.name = 'MangelImageError';
  }
}

/**
 * Verkleinert das Bild und prüft es gegen dieselben Bedingungen wie die
 * `storage.rules`. Wirft `MangelImageError`, wenn der Upload dort scheitern
 * würde.
 *
 * Die Prüfung steht bewusst **nach** dem Verkleinern: Ein 20-MB-Foto aus einer
 * Handykamera ist danach ein paar hundert Kilobyte groß und völlig in Ordnung.
 * Abgelehnt wird nur, was auch verkleinert nicht durchkäme — in aller Regel
 * eine Datei, die der Browser gar nicht erst dekodieren konnte.
 */
export async function prepareMangelImage(
  file: File,
): Promise<CompressedImage> {
  const image = await compressImage(file);
  if (!isAllowedMangelImageType(image.contentType)) {
    throw new MangelImageError('imageTypeUnsupported', file.name);
  }
  if (image.blob.size > MANGEL_MAX_IMAGE_BYTES) {
    throw new MangelImageError('imageTooLarge', file.name);
  }
  return image;
}
