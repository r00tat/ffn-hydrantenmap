// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  compressImage,
  jpegFileName,
  MAX_IMAGE_DIMENSION,
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
