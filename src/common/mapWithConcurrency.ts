/**
 * `Promise.all(items.map(fn))` mit höchstens `limit` gleichzeitig laufenden
 * Aufrufen. Das Ergebnis hat die Reihenfolge der Eingabe; der erste Fehler
 * lehnt ab, wie bei `Promise.all`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const worker = async () => {
    while (next < items.length && !failed) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () =>
      worker(),
    ),
  );
  return results;
}
