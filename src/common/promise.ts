export async function allSettled<T>(promises: Promise<T>[]) {
  const results = await Promise.allSettled(promises);
  results
    .filter((p) => p.status === 'rejected')
    .map((p) => (p as PromiseRejectedResult).reason)
    .forEach(console.warn);

  return results
    .filter((p) => p.status === 'fulfilled')
    .map((p) => (p as PromiseFulfilledResult<T>).value);
}

/**
 * Wie `Array.map` mit `Promise.all`, führt aber höchstens `limit` Aufgaben
 * gleichzeitig aus. Die Reihenfolge der Ergebnisse bleibt die der Eingabe.
 *
 * Gedacht für Arbeit, die sonst unbegrenzt parallel losläuft: Ein Einsatz mit
 * 200 Auto-Snapshots stößt sonst 400 Firestore-Abfragen auf einmal an, ein
 * Export mit vielen Anhängen lädt alle Dateien gleichzeitig in den Speicher.
 * Nebenbei wird eine Fortschrittsanzeige dadurch gleichmäßig statt in Sprüngen.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const slots = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: slots }, worker));
  return results;
}
