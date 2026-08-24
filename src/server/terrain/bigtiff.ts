/**
 * Nur so viel BigTIFF, wie das BEV-ALS-DGM braucht.
 *
 * Die Quelldateien sind 9,6 GB groß, aber der Server liefert
 * `Accept-Ranges: bytes` und die Kachelverzeichnisse liegen in den ersten
 * ~615 KB. Damit kostet ein 256 m × 256 m Ausschnitt genau einen
 * Range-Request; vollständig herunterladen müsste man 9,6 GB für 0,065 km².
 *
 * Kein GDAL, keine neue Dependency: der Leser braucht BigTIFF little-endian,
 * tiled, LZW ohne Predictor, Float32, ein Sample je Pixel. Alles andere wird
 * **abgelehnt** statt halb unterstützt — ein stillschweigend falsch dekodiertes
 * Höhenraster wäre schlimmer als ein Abbruch.
 */

export type FetchRange = (from: number, to: number) => Promise<Uint8Array>;

export interface BigTiffInfo {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tileCols: number;
  tileRows: number;
  /** Ostwert des Rasterursprungs (Pixel 0,0) in m. */
  originE: number;
  /** Nordwert des Rasterursprungs (Pixel 0,0) in m. */
  originN: number;
  pixelSizeM: number;
  nodata: number;
  tileOffsets: BigUint64Array;
  tileByteCounts: BigUint64Array;
}

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  16: 8,
  17: 8,
  18: 8,
};

const TAG = {
  width: 256,
  height: 257,
  bitsPerSample: 258,
  compression: 259,
  samplesPerPixel: 277,
  predictor: 317,
  tileWidth: 322,
  tileHeight: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  sampleFormat: 339,
  pixelScale: 33550,
  tiepoint: 33922,
  nodata: 42113,
} as const;

interface Entry {
  type: number;
  count: number;
  /** Inline-Wert, wenn er in 8 Byte passt. */
  inline?: Uint8Array;
  offset?: number;
}

/** Kopf, in dem IFD und die kleinen Tags sicher liegen. */
const HEAD_BYTES = 65_536;

export async function readBigTiffInfo(
  fetchRange: FetchRange
): Promise<BigTiffInfo> {
  const head = await fetchRange(0, HEAD_BYTES - 1);
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);

  if (head[0] !== 0x49 || head[1] !== 0x49) {
    throw new Error('BigTIFF: nur little-endian unterstützt');
  }
  if (view.getUint16(2, true) !== 43) {
    throw new Error('BigTIFF: erwartet Version 43');
  }
  if (view.getUint16(4, true) !== 8) {
    throw new Error('BigTIFF: erwartet 8-Byte-Offsets');
  }

  const ifdOffset = Number(view.getBigUint64(8, true));
  const entryCount = Number(view.getBigUint64(ifdOffset, true));
  const entries = new Map<number, Entry>();
  for (let i = 0; i < entryCount; i += 1) {
    const at = ifdOffset + 8 + i * 20;
    const tag = view.getUint16(at, true);
    const type = view.getUint16(at + 2, true);
    const count = Number(view.getBigUint64(at + 4, true));
    const size = (TYPE_SIZE[type] ?? 1) * count;
    entries.set(
      tag,
      size <= 8
        ? { type, count, inline: head.subarray(at + 12, at + 12 + size) }
        : { type, count, offset: Number(view.getBigUint64(at + 12, true)) }
    );
  }

  const short = (tag: number): number | undefined => {
    const entry = entries.get(tag);
    if (!entry?.inline) return undefined;
    return new DataView(
      entry.inline.buffer,
      entry.inline.byteOffset,
      entry.inline.byteLength
    ).getUint16(0, true);
  };

  const compression = short(TAG.compression);
  if (compression !== 5) {
    throw new Error(`BigTIFF: nur LZW unterstützt, nicht ${compression}`);
  }
  if ((short(TAG.predictor) ?? 1) !== 1) {
    throw new Error('BigTIFF: Predictor wird nicht unterstützt');
  }
  if (short(TAG.bitsPerSample) !== 32 || short(TAG.sampleFormat) !== 3) {
    throw new Error('BigTIFF: erwartet Float32');
  }
  if ((short(TAG.samplesPerPixel) ?? 1) !== 1) {
    throw new Error('BigTIFF: erwartet ein Sample je Pixel');
  }

  const width = short(TAG.width);
  const height = short(TAG.height);
  const tileWidth = short(TAG.tileWidth);
  const tileHeight = short(TAG.tileHeight);
  if (!width || !height || !tileWidth || !tileHeight) {
    throw new Error('BigTIFF: Kachelgeometrie fehlt');
  }

  const bytesOf = async (entry: Entry): Promise<Uint8Array> =>
    entry.inline
      ? entry.inline
      : fetchRange(
          entry.offset as number,
          (entry.offset as number) +
            (TYPE_SIZE[entry.type] ?? 1) * entry.count -
            1
        );

  const doubles = async (tag: number): Promise<number[]> => {
    const entry = entries.get(tag);
    if (!entry) return [];
    const bytes = await bytesOf(entry);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Array.from({ length: entry.count }, (_, i) =>
      dv.getFloat64(i * 8, true)
    );
  };

  /** `BigUint64Array` verlangt 8-Byte-Ausrichtung, deshalb wird kopiert. */
  const readU64 = async (entry: Entry): Promise<BigUint64Array> => {
    const bytes = await bytesOf(entry);
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new BigUint64Array(copy.buffer);
  };

  const offsetsEntry = entries.get(TAG.tileOffsets);
  const countsEntry = entries.get(TAG.tileByteCounts);
  if (!offsetsEntry || !countsEntry) {
    throw new Error('BigTIFF: Kachelverzeichnis fehlt');
  }

  const nodataEntry = entries.get(TAG.nodata);
  const nodataText = nodataEntry
    ? new TextDecoder().decode(await bytesOf(nodataEntry))
    : '-9999';

  const [pixelScale, tiepoint, tileOffsets, tileByteCounts] = await Promise.all(
    [
      doubles(TAG.pixelScale),
      doubles(TAG.tiepoint),
      readU64(offsetsEntry),
      readU64(countsEntry),
    ]
  );

  return {
    width,
    height,
    tileWidth,
    tileHeight,
    tileCols: Math.ceil(width / tileWidth),
    tileRows: Math.ceil(height / tileHeight),
    originE: tiepoint[3],
    originN: tiepoint[4],
    pixelSizeM: pixelScale[0],
    nodata: Number.parseFloat(nodataText) || -9999,
    tileOffsets,
    tileByteCounts,
  };
}

/**
 * TIFF-LZW: MSB-first, Early Change.
 *
 * Der Codebreiten-Wechsel passiert einen Code früher als bei GIF-LZW. Ohne
 * Early Change verschiebt sich das Wörterbuch, und das Ergebnis ist
 * stillschweigend Müll — keine Ausnahme, nur falsche Höhen.
 */
export function lzwDecode(input: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let outAt = 0;

  const dictionary: Uint8Array[] = [];
  const resetDictionary = () => {
    dictionary.length = 0;
    for (let i = 0; i < 256; i += 1) dictionary.push(Uint8Array.of(i));
    dictionary.push(new Uint8Array(0), new Uint8Array(0)); // 256 Clear, 257 EOI
  };
  resetDictionary();

  let bitPos = 0;
  let codeWidth = 9;
  let previous: Uint8Array | undefined;
  const totalBits = input.length * 8;

  const emit = (bytes: Uint8Array) => {
    const room = Math.min(bytes.length, expected - outAt);
    if (room <= 0) return;
    out.set(room === bytes.length ? bytes : bytes.subarray(0, room), outAt);
    outAt += room;
  };

  while (bitPos + codeWidth <= totalBits && outAt < expected) {
    const byteAt = bitPos >> 3;
    const chunk =
      ((input[byteAt] ?? 0) << 16) |
      ((input[byteAt + 1] ?? 0) << 8) |
      (input[byteAt + 2] ?? 0);
    const code =
      (chunk >> (24 - (bitPos & 7) - codeWidth)) & ((1 << codeWidth) - 1);
    bitPos += codeWidth;

    if (code === 257) break;
    if (code === 256) {
      resetDictionary();
      codeWidth = 9;
      previous = undefined;
      continue;
    }

    let entry: Uint8Array;
    if (previous === undefined) {
      entry = dictionary[code];
      if (entry === undefined) break;
    } else if (code < dictionary.length) {
      entry = dictionary[code];
      const grown = new Uint8Array(previous.length + 1);
      grown.set(previous);
      grown[previous.length] = entry[0];
      dictionary.push(grown);
    } else {
      entry = new Uint8Array(previous.length + 1);
      entry.set(previous);
      entry[previous.length] = previous[0];
      dictionary.push(entry);
    }

    emit(entry);
    previous = entry;

    if (dictionary.length + 1 >= 1 << codeWidth && codeWidth < 12) {
      codeWidth += 1;
    }
  }

  return out;
}

/**
 * Eine interne Kachel als `Float32Array` in Lesereihenfolge (Zeilen nach
 * Süden). `undefined`, wenn die Kachel leer ist — das kommt bei den
 * BEV-Dateien außerhalb der Datenabdeckung vor und ist kein Fehler.
 */
export async function readTile(
  info: BigTiffInfo,
  index: number,
  fetchRange: FetchRange
): Promise<Float32Array | undefined> {
  // Kein BigInt-Literal (`0n`): das Zielniveau des Projekts liegt unter ES2020.
  const rawCount = info.tileByteCounts[index];
  const byteCount = rawCount === undefined ? 0 : Number(rawCount);
  if (byteCount === 0) return undefined;
  const offset = Number(info.tileOffsets[index]);
  const raw = await fetchRange(offset, offset + byteCount - 1);
  const pixels = info.tileWidth * info.tileHeight;
  const decoded = lzwDecode(raw, pixels * 4);
  const copy = new Uint8Array(decoded.length);
  copy.set(decoded);
  return new Float32Array(copy.buffer, 0, pixels);
}
