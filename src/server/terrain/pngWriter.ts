import sharp from 'sharp';
import {
  encodeHeight,
  encodedToRgb,
  type HeightEncoding,
} from '../../common/terrain/encoding';

/**
 * Terrain-RGB-PNG **ohne Farbprofil**.
 *
 * `sharp` schreibt ohne `withMetadata()` keine `iCCP`/`gAMA`/`sRGB`-Chunks, und
 * das ist Absicht: mit Farbprofil darf der Browser die Kanalwerte umrechnen.
 * Bei einem Bild wäre das erwünscht, bei kodierten Höhen verschiebt es das
 * Gelände. Der Client liest die Kacheln entsprechend mit
 * `colorSpaceConversion: 'none'`.
 *
 * Drei Kanäle ohne Alpha: eine deckende Kachel kann nicht von einer
 * Alpha-Vormultiplikation verfälscht werden.
 */
export async function writeTerrainPng(
  heights: Float32Array,
  sizePx: number,
  encoding: HeightEncoding,
  target: string
): Promise<void> {
  if (heights.length !== sizePx * sizePx) {
    throw new Error(
      `writeTerrainPng: ${heights.length} Höhen passen nicht zu ${sizePx}x${sizePx}`
    );
  }

  const rgb = Buffer.allocUnsafe(sizePx * sizePx * 3);
  for (let i = 0; i < heights.length; i += 1) {
    const value = Number.isNaN(heights[i])
      ? encoding.nodataValue
      : encodeHeight(heights[i], encoding);
    const [r, g, b] = encodedToRgb(value);
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }

  await sharp(rgb, { raw: { width: sizePx, height: sizePx, channels: 3 } })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toFile(target);
}

/** Eine Terrain-RGB-Kachel wieder als Höhen lesen — für Prüfungen und Tests. */
export async function readTerrainPng(
  source: string,
  encoding: HeightEncoding
): Promise<{ heights: Float32Array; sizePx: number }> {
  const { data, info } = await sharp(source)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const heights = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const encoded =
      (data[i * info.channels] << 16) |
      (data[i * info.channels + 1] << 8) |
      data[i * info.channels + 2];
    heights[i] =
      encoded === encoding.nodataValue
        ? Number.NaN
        : encoding.base + encoded * encoding.step;
  }
  return { heights, sizePx: info.width };
}
