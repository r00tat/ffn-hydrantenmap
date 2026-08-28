import 'server-only';

/**
 * Die Fahrzeugbilder von Euro NCAP laufen über den eigenen Origin.
 *
 * Nicht aus Bequemlichkeit: Euro NCAP liefert die PNGs mit
 * `Content-Type: application/pdf`. Für eine cross-origin-Antwort ohne CORS
 * steht `application/pdf` auf der „never sniffed"-Liste von Chromes Opaque
 * Response Blocking — der Browser verwirft die Antwort mit
 * `net::ERR_BLOCKED_BY_ORB`, ohne die Bytes anzusehen. Kein einziges
 * Fahrzeugbild wurde dadurch angezeigt, obwohl jede URL ein gültiges PNG
 * liefert.
 *
 * Über den eigenen Origin greift ORB nicht, und der richtige Content-Type
 * steht ohnehin fest, sobald die Bytes geprüft sind.
 */

/** Grenze je Bild. Die Bilder von Euro NCAP liegen bei 100–200 kB. */
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export interface RescuePicture {
  body: Uint8Array;
  contentType: string;
}

/**
 * Der Bildtyp aus den ersten Bytes.
 *
 * Der Content-Type der Antwort ist nachweislich falsch, also entscheidet der
 * Inhalt. Was sich nicht als Bild ausweist, wird verworfen — sonst würde die
 * Route beliebige fremde Bytes unter unserem Origin ausliefern.
 */
export function sniffImageType(bytes: Uint8Array): string | undefined {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png';
  }
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return undefined;
}

/**
 * Den Körper lesen und dabei zählen.
 *
 * `response.arrayBuffer()` würde erst die ganze Antwort in den Speicher holen
 * und danach die Grenze prüfen — eine Grenze, die nichts begrenzt. Ein Dienst,
 * der ohne `content-length` endlos sendet, brächte den Server damit zum
 * Erliegen. Deshalb stückweise lesen und beim Überschreiten abbrechen.
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const stream = response.body;
  if (!stream) return undefined;

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Ein Fahrzeugbild von Euro NCAP holen und als Bild ausweisen.
 *
 * Die Adresse stammt aus dem Katalog und nicht aus dem Request — die Route
 * nimmt eine Varianten-ID entgegen. Damit ist der Proxy kein offener Proxy,
 * und es gibt hier nichts gegen SSRF abzusichern, was der Katalog nicht schon
 * geprüft hätte (`safeUrl`: nur https).
 */
export async function fetchRescuePicture(
  url: string,
): Promise<RescuePicture | undefined> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
    headers: { accept: 'image/*,*/*' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    return undefined;
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PICTURE_BYTES) {
    await response.body?.cancel();
    return undefined;
  }

  const body = await readCapped(response, MAX_PICTURE_BYTES);
  if (!body) return undefined;

  const contentType = sniffImageType(body);
  if (!contentType) return undefined;

  return { body, contentType };
}
