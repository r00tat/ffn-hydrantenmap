import type { TerrainLevel } from './terrainIndexTypes';

/**
 * Terrain-RGB: `h = base + (R * 65536 + G * 256 + B) * step`.
 *
 * 8-Bit-RGB und nicht 16-Bit-Graustufen, obwohl beide gleich groß komprimieren:
 * der Browser wirft 16-Bit-PNG beim Dekodieren ins Canvas auf 8 Bit ab. Die
 * Präzision wäre verloren, ohne dass es auffiele.
 *
 * `nodataValue` ist ein reservierter kodierter Wert. Er darf **nie** als Höhe
 * durchgehen: aus nodata = 0 m würde im Wasserstandsmodell eine überflutete
 * Fläche, wo überhaupt keine Daten vorliegen.
 */

/** 0xFFFFFF — bei `step` 0,1 m entspräche das 1.677.721,5 m, also nie eine echte Höhe. */
export const NODATA_ENCODED = 0xffffff;

export type HeightEncoding = Pick<
  TerrainLevel,
  'base' | 'step' | 'nodataValue'
>;

export const encodeHeight = (
  heightM: number | undefined,
  encoding: HeightEncoding
): number => {
  if (heightM === undefined || !Number.isFinite(heightM)) {
    return encoding.nodataValue;
  }
  const value = Math.round((heightM - encoding.base) / encoding.step);
  if (value < 0 || value >= encoding.nodataValue) return encoding.nodataValue;
  return value;
};

export const decodeHeight = (
  encoded: number,
  encoding: HeightEncoding
): number | undefined =>
  encoded === encoding.nodataValue
    ? undefined
    : encoding.base + encoded * encoding.step;

/** Kodierter Wert → RGB-Tripel. */
export const encodedToRgb = (encoded: number): [number, number, number] => [
  (encoded >> 16) & 0xff,
  (encoded >> 8) & 0xff,
  encoded & 0xff,
];

export const rgbToEncoded = (r: number, g: number, b: number): number =>
  (r << 16) | (g << 8) | b;

/**
 * Ein ganzer Block RGBA aus einem Canvas → kodierte Werte.
 *
 * Der Alphakanal wird verworfen: die Kacheln sind deckend, damit keine
 * Vormultiplikation die Farbwerte und damit die Höhen verändern kann.
 */
export function rgbaToEncodedBlock(
  rgba: Uint8ClampedArray | Uint8Array,
  pixels: number
): Uint32Array {
  const out = new Uint32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    out[i] = rgbToEncoded(rgba[o], rgba[o + 1], rgba[o + 2]);
  }
  return out;
}
