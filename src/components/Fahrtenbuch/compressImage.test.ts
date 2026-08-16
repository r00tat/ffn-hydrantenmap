// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MANGEL_MAX_IMAGE_BYTES } from '../../common/mangel';
import {
  compressImage,
  imageTypeFromName,
  jpegFileName,
  MAX_IMAGE_DIMENSION,
  prepareMangelImage,
  scaledDimensions,
} from './compressImage';

describe('scaledDimensions', () => {
  it('verkleinert auf die lange Kante und behält das Seitenverhältnis', () => {
    expect(scaledDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('rechnet ein kleines Bild nicht hoch', () => {
    // Mehr Bytes ohne einen einzigen zusätzlichen Bildpunkt.
    expect(scaledDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('lässt kein Bild auf null Pixel schrumpfen', () => {
    expect(scaledDimensions(10000, 1)).toEqual({
      width: MAX_IMAGE_DIMENSION,
      height: 1,
    });
  });

  it('meldet unbrauchbare Maße als null', () => {
    expect(scaledDimensions(0, 100)).toEqual({ width: 0, height: 0 });
    expect(scaledDimensions(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('jpegFileName', () => {
  it('ersetzt die Endung — aus einem HEIC wird hier ein JPEG', () => {
    expect(jpegFileName('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
    expect(jpegFileName('foto')).toBe('foto.jpg');
  });
});

describe('compressImage', () => {
  it('gibt das Original zurück, wenn der Browser nicht dekodieren kann', async () => {
    // jsdom kennt kein `createImageBitmap`. Genau das ist der Fall, den die
    // Rückfallebene abdeckt: Lieber ein großes Foto als gar keines.
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const result = await compressImage(file);
    expect(result.blob).toBe(file);
    expect(result.fileName).toBe('foto.jpg');
  });

  it('lässt eine Datei, die kein Bild ist, unverändert', async () => {
    const file = new File(['x'], 'notiz.txt', { type: 'text/plain' });
    const result = await compressImage(file);
    expect(result.blob).toBe(file);
    expect(result.contentType).toBe('text/plain');
  });
});

describe('imageTypeFromName', () => {
  it('leitet den Typ aus der Endung ab', () => {
    expect(imageTypeFromName('IMG_0042.JPG')).toBe('image/jpeg');
    expect(imageTypeFromName('foto.jpeg')).toBe('image/jpeg');
    expect(imageTypeFromName('screenshot.png')).toBe('image/png');
    expect(imageTypeFromName('bild.heic')).toBe('image/heic');
    expect(imageTypeFromName('bild.webp')).toBe('image/webp');
  });

  it('rät nicht bei einer unbekannten Endung', () => {
    expect(imageTypeFromName('notiz.txt')).toBeUndefined();
    expect(imageTypeFromName('foto')).toBeUndefined();
  });
});

describe('prepareMangelImage', () => {
  it('gibt ein normales Foto durch', async () => {
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const result = await prepareMangelImage(file);
    expect(result.contentType).toBe('image/jpeg');
  });

  it('lehnt ein Bild über der Höchstgröße ab, statt es dem Storage vorzuwerfen', async () => {
    // Ohne diese Prüfung antwortet der Storage mit `storage/unauthorized` und
    // der Melder liest „Upload fehlgeschlagen", ohne den Grund zu erfahren.
    const file = new File(['x'], 'gross.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', {
      value: MANGEL_MAX_IMAGE_BYTES + 1,
    });
    await expect(prepareMangelImage(file)).rejects.toMatchObject({
      reason: 'imageTooLarge',
      fileName: 'gross.jpg',
    });
  });

  it('lehnt ab, was kein Bild ist', async () => {
    const file = new File(['x'], 'notiz.txt', { type: 'text/plain' });
    await expect(prepareMangelImage(file)).rejects.toMatchObject({
      reason: 'imageTypeUnsupported',
      fileName: 'notiz.txt',
    });
  });

  it('nimmt ein Foto an, für das der Browser keinen Typ meldet', async () => {
    // Manche Android-Sharetargets liefern eine Datei ohne MIME-Typ. Bisher ging
    // sie als `application/octet-stream` in den Upload und lief in die
    // Contenttype-Bedingung der Regel.
    const file = new File(['x'], 'IMG_0042.jpg', { type: '' });
    const result = await prepareMangelImage(file);
    expect(result.contentType).toBe('image/jpeg');
  });
});
