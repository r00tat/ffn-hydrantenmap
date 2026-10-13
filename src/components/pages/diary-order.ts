import { parseTimestamp } from '../../common/time-format';

interface OrderableDiary {
  datum?: string;
  nummer?: number;
}

/**
 * Zeitpunkt eines Eintrags in Millisekunden. Nicht über den formatierten
 * Text: Der ist nur sekundengenau, und Einträge aus einem Vorgang — etwa
 * „abgezogen" und „zugeordnet" beim Wechsel des Einsatzorts — entstehen in
 * derselben Sekunde.
 */
export function diaryTime(datum?: string): number {
  return parseTimestamp(datum)?.valueOf() ?? Date.now();
}

/**
 * Chronologische Reihenfolge der Tagebucheinträge: nach Zeitpunkt, bei
 * gleichem Zeitpunkt nach der gespeicherten Nummer.
 */
export function compareDiaryChronological(
  a: OrderableDiary,
  b: OrderableDiary,
): number {
  return (
    diaryTime(a.datum) - diaryTime(b.datum) ||
    (a.nummer ?? Number.MAX_SAFE_INTEGER) - (b.nummer ?? Number.MAX_SAFE_INTEGER)
  );
}
