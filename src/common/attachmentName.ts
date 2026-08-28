import { v4 as uuid } from 'uuid';

/**
 * Anhänge liegen im Storage unter `<uuid>-<Dateiname>`. Der Präfix trennt zwei
 * Dateien, die am selben Einsatz gleich heißen — ohne ihn überschreibt die
 * zweite die erste.
 *
 * Die Konvention stand früher an acht Stellen als nacktes `substring(37)` im
 * Code, und der Import hat den Präfix beim Wiederhochladen nicht gesetzt. Damit
 * überschrieben sich gleichnamige Anhänge, und ein erneuter Export schnitt vom
 * kurzen Namen 37 Zeichen ab — übrig blieb ein leerer Name. Deshalb steht die
 * Regel jetzt einmal hier.
 */
export const STORAGE_NAME_PREFIX_LENGTH = 37;

const UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** Speichername für eine neu hochgeladene Datei. */
export function storageFileName(fileName: string): string {
  return `${uuid()}-${fileName}`;
}

/**
 * Der Name, wie ihn die Benutzerin hochgeladen hat.
 *
 * Geprüft wird auf einen echten UUID-Präfix statt blind 37 Zeichen zu
 * schneiden: Anhänge aus einem Import vor dieser Korrektur liegen ohne Präfix
 * im Storage und behalten so ihren Namen.
 */
export function displayFileName(storageName: string): string {
  return UUID_PREFIX.test(storageName)
    ? storageName.substring(STORAGE_NAME_PREFIX_LENGTH)
    : storageName;
}
