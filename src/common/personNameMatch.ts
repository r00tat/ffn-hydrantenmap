/**
 * Abgleich eines Namens aus dem Excel (Nachname, Vorname) mit den Personen
 * einer Gruppe. `person.name` ist ein freies Feld — mal „Vorname Nachname",
 * mal „Nachname Vorname" —, deshalb werden beide Reihenfolgen geprüft.
 */

/**
 * Klein geschrieben, Leerzeichen zusammengefasst, Punkte entfernt. Umlaute
 * bleiben bewusst erhalten: „Müller" und „Muller" sind verschiedene Namen.
 */
export function normalizePersonName(name: string): string {
  return name.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

export interface PersonMatch {
  status: 'matched' | 'uncertain' | 'new';
  personId?: string;
  /** personIds */
  candidates: string[];
}

/** Höchster Levenshtein-Abstand, bei dem eine Schreibweise als ähnlich gilt. */
const MAX_DISTANCE = 2;

export function matchPersonName(
  nachname: string,
  vorname: string,
  persons: { id: string; name: string }[],
): PersonMatch {
  const variants = [
    normalizePersonName(`${vorname} ${nachname}`),
    normalizePersonName(`${nachname} ${vorname}`),
  ];

  const exact = persons.filter((p) =>
    variants.includes(normalizePersonName(p.name)),
  );
  if (exact.length === 1) {
    return { status: 'matched', personId: exact[0].id, candidates: [exact[0].id] };
  }
  if (exact.length > 1) {
    return { status: 'uncertain', candidates: exact.map((p) => p.id) };
  }

  const similar = persons.filter((p) => {
    const name = normalizePersonName(p.name);
    return variants.some((v) => levenshtein(v, name, MAX_DISTANCE) <= MAX_DISTANCE);
  });
  if (similar.length > 0) {
    return { status: 'uncertain', candidates: similar.map((p) => p.id) };
  }
  return { status: 'new', candidates: [] };
}

/**
 * Levenshtein-Abstand; bricht ab, sobald er `limit` sicher übersteigt, und
 * liefert dann `limit + 1`.
 */
function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}
