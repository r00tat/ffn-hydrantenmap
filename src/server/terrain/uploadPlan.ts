/**
 * Was der Upload überträgt und wie viel davon gleichzeitig.
 *
 * Eigene Datei, damit beides ohne `firebase-admin` und ohne den Import selbst
 * prüfbar ist: `terrainImport.ts` startet beim Laden `main()`.
 */

export interface UploadPlan {
  /** Blocknamen, die übertragen werden. */
  upload: string[];
  /** Wie viele schon im Speicher lagen. */
  skipped: number;
}

/**
 * Blöcke, die noch fehlen.
 *
 * Der Upload überträgt sonst bei jedem Lauf alle 4.385 Kacheln — 1,5 GiB, auch
 * wenn nur zwanzig neu sind, und nach einem Abbruch beginnt er wieder von
 * vorn. Übersprungen wird anhand des Zielpfads, und der trägt die
 * Modellversion (`terrain/v1/…`): ändert sich der Inhalt einer Kachel, ändert
 * sich die Version und damit der Pfad. Für den Ausnahmefall, dass innerhalb
 * einer Version neu kodiert wurde, gibt es `--reupload`.
 */
export function blocksToUpload(
  local: string[],
  remote: ReadonlySet<string>,
  destinationOf: (block: string) => string,
  reupload = false
): UploadPlan {
  if (reupload) return { upload: [...local], skipped: 0 };
  const upload = local.filter((block) => !remote.has(destinationOf(block)));
  return { upload, skipped: local.length - upload.length };
}

/**
 * Aufgaben mit einer Obergrenze gleichzeitig abarbeiten.
 *
 * Ein Upload nach dem anderen kostet bei tausenden Kacheln je eine volle
 * Rundreise; gleichzeitig übertragen ist um ein Vielfaches schneller. Der
 * erste Fehler bricht ab — eine halb übertragene Stufe, die als fertig
 * gemeldet wird, wäre schlimmer als ein Abbruch.
 */
export async function runPooled<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        await work(items[index], index);
      }
    }
  );
  await Promise.all(workers);
}
