import type { BlockRef } from './grid';
import type { TerrainAvailability, TerrainLevel } from './terrainIndexTypes';

/**
 * Verfügbarkeit der Blöcke als Bitmap statt als Liste.
 *
 * Die Blöcke liegen auf einem regulären Gitter; eine Liste von IDs kodiert
 * dieselbe Information redundant. Für das Burgenland sind das 70 × 155 =
 * 10.850 Bit = 1.357 Byte gegen etwa 82 KB Blockliste — und der Zugriff ist
 * ein Bit-Index statt eines Set-Lookups über tausende Strings.
 *
 * Der Client braucht diese Information, weil sonst jede Abfrage nahe der
 * Landesgrenze einen 404-Roundtrip kostet — und weil offline ein 404 nicht von
 * „nicht im Cache" zu unterscheiden ist.
 *
 * **Durchgehend gepackt, kein Zeilenpadding auf Byte-Grenzen.** Die Formel
 * `zeile * cols + spalte` setzt das voraus; mit Padding wären es für das
 * Burgenland 1.550 statt 1.357 Byte, und beide Seiten müssten dieselbe
 * Annahme treffen.
 */

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
};

const fromBase64 = (value: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
};

export function encodeAvailability(
  cols: number,
  rows: number,
  isSet: (col: number, row: number) => boolean
): TerrainAvailability {
  const bytes = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!isSet(col, row)) continue;
      const bit = row * cols + col;
      bytes[bit >> 3] |= 0x80 >> (bit & 7);
    }
  }
  return { cols, rows, bits: toBase64(bytes) };
}

export interface AvailabilityLookup {
  hasCell(col: number, row: number): boolean;
  /** Anzahl gesetzter Zellen — für Fortschrittsanzeigen und Prüfungen. */
  count(): number;
}

export function decodeAvailability(
  availability: TerrainAvailability
): AvailabilityLookup {
  const { cols, rows } = availability;
  const bytes = fromBase64(availability.bits);

  const hasCell = (col: number, row: number): boolean => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
    const bit = row * cols + col;
    const byte = bytes[bit >> 3];
    return byte === undefined ? false : (byte & (0x80 >> (bit & 7))) !== 0;
  };

  return {
    hasCell,
    count() {
      let total = 0;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (hasCell(col, row)) total += 1;
        }
      }
      return total;
    },
  };
}

/** Gitterposition eines Blocks in der Bitmap seiner Stufe. */
export function availabilityCell(
  level: Pick<TerrainLevel, 'bounds' | 'blockSizeM'>,
  block: BlockRef
): { col: number; row: number } {
  return {
    col: (block.e - level.bounds.eMin) / level.blockSizeM,
    row: (block.n - level.bounds.nMin) / level.blockSizeM,
  };
}

/**
 * Ob ein Block in dieser Stufe vorliegt.
 *
 * Eine nicht ganzzahlige Gitterposition bedeutet, dass der Block nicht auf dem
 * Gitter der Stufe liegt — dann gibt es ihn nicht, und Runden wäre falsch.
 */
export function hasBlock(
  level: Pick<TerrainLevel, 'bounds' | 'blockSizeM'>,
  lookup: AvailabilityLookup,
  block: BlockRef
): boolean {
  const { col, row } = availabilityCell(level, block);
  return Number.isInteger(col) && Number.isInteger(row)
    ? lookup.hasCell(col, row)
    : false;
}

/** Alle vorhandenen Blöcke einer Stufe — Manifest für das Offline-Paket. */
export function availableBlocks(
  level: Pick<TerrainLevel, 'bounds' | 'blockSizeM' | 'availability'>
): BlockRef[] {
  const lookup = decodeAvailability(level.availability);
  const blocks: BlockRef[] = [];
  for (let row = 0; row < level.availability.rows; row += 1) {
    for (let col = 0; col < level.availability.cols; col += 1) {
      if (!lookup.hasCell(col, row)) continue;
      blocks.push({
        e: level.bounds.eMin + col * level.blockSizeM,
        n: level.bounds.nMin + row * level.blockSizeM,
        sizeM: level.blockSizeM,
      });
    }
  }
  return blocks;
}
