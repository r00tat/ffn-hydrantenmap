import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readBigTiffInfo, type BigTiffInfo, type FetchRange } from './bigtiff';

/**
 * Zugriff auf das BEV-ALS-DGM über HTTP-Range-Requests.
 *
 * Eine Quelldatei ist 9,6 GB groß, der Server liefert aber `Accept-Ranges`, und
 * die Kachelverzeichnisse liegen in den ersten ~615 KB. Damit kostet jeder
 * 256-m-Ausschnitt genau einen Range-Request statt eines Volldownloads.
 *
 * Die Ratenbegrenzung ist Höflichkeit gegenüber einem kostenlos
 * bereitgestellten Behördendienst: eine Obergrenze gleichzeitiger Anfragen mit
 * einem Mindestabstand. Ohne das würde ein landesweiter Import den Dienst mit
 * zehntausenden Anfragen in kurzer Zeit belegen.
 *
 * Die Zahlen sind gemessen, nicht geschätzt (25 Kacheln aus einer Quelldatei):
 *
 * | gleichzeitig | je Kachel |
 * | --- | --- |
 * | 1 | 45 ms |
 * | 4 | 22 ms |
 * | 8 | 13 ms |
 * | 12 | 17 ms |
 *
 * Über acht bringt es nichts mehr — der Dienst wird dann langsamer, nicht
 * schneller. Der Mindestabstand von 100 ms war der eigentliche Engpass: er
 * kostete mehr als die Antwortzeit des Servers und machte aus einem Block mit
 * 25 Kacheln 2,5 Sekunden Wartezeit. 25 ms halten die Dauerlast im Rahmen,
 * ohne den Import daran aufzuhängen.
 */

export const BEV_BASE_URL = 'https://data.bev.gv.at/download/ALS/DTM/20190915';
export const BEV_EPOCH = '20190915';

const MAX_PARALLEL = 8;
const MIN_INTERVAL_MS = 25;
const MAX_ATTEMPTS = 4;

let running = 0;
let lastStart = 0;
const queue: (() => void)[] = [];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Wartet, bis ein Platz frei ist und der Mindestabstand eingehalten wurde. */
async function acquire(): Promise<void> {
  if (running >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  running += 1;
  const wait = lastStart + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
}

function release(): void {
  running -= 1;
  queue.shift()?.();
}

/**
 * Range-Reader für eine Quellkachel.
 *
 * Wiederholt bei 5xx und Netzfehlern mit wachsendem Abstand. Ein 416 oder 404
 * wird **nicht** wiederholt — das ist ein Fehler im Aufruf, nicht im Netz.
 */
export function bevFetchRange(tileName: string): FetchRange {
  const url = `${BEV_BASE_URL}/${tileName}`;
  return async (from, to) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await acquire();
      try {
        const response = await fetch(url, {
          headers: { Range: `bytes=${from}-${to}` },
        });
        if (response.status === 404 || response.status === 416) {
          throw new Error(`${url}: HTTP ${response.status} (kein Retry)`);
        }
        if (!response.ok && response.status !== 206) {
          throw new Error(`${url}: HTTP ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      } catch (err) {
        lastError = err;
        if (String(err).includes('kein Retry')) throw err;
        if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt);
      } finally {
        release();
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`${url}: Range ${from}-${to} fehlgeschlagen`);
  };
}

/**
 * `BigTiffInfo` einer Quellkachel, auf Platte zwischengespeichert.
 *
 * Die Kachelverzeichnisse sind 615 KB je Datei. Ohne Cache würde ein Neustart
 * des Imports sie für jede der bis zu zwölf Burgenland-Quellkacheln erneut
 * laden.
 */
export async function bevTileInfo(
  tileName: string,
  cacheDir: string
): Promise<BigTiffInfo> {
  const file = path.join(cacheDir, 'bev', `${tileName}.info.json`);
  try {
    const cached = JSON.parse(await readFile(file, 'utf8')) as {
      info: Omit<BigTiffInfo, 'tileOffsets' | 'tileByteCounts'>;
      tileOffsets: string[];
      tileByteCounts: string[];
    };
    return {
      ...cached.info,
      tileOffsets: BigUint64Array.from(cached.tileOffsets, BigInt),
      tileByteCounts: BigUint64Array.from(cached.tileByteCounts, BigInt),
    };
  } catch {
    // Kein Cache — regulär laden.
  }

  const info = await readBigTiffInfo(bevFetchRange(tileName));
  await mkdir(path.dirname(file), { recursive: true });
  const { tileOffsets, tileByteCounts, ...rest } = info;
  await writeFile(
    file,
    JSON.stringify({
      info: rest,
      // JSON kennt kein BigInt, deshalb als Strings.
      tileOffsets: Array.from(tileOffsets, String),
      tileByteCounts: Array.from(tileByteCounts, String),
    })
  );
  return info;
}
