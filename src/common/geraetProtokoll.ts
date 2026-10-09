/**
 * Protokoll je Artikel: reine Hilfsfunktionen für die Einträge in
 * `geraetBuchung` ohne Mengenänderung (Stammdaten, Chargen, Lagerorte …).
 *
 * Werte werden beim Schreiben als Text festgehalten, damit das Protokoll
 * lesbar bleibt, auch wenn sich Typen später ändern.
 */

import { formatLagerort, type GeraetFeldAenderung, type GeraetLagerort } from './geraet';

function isLagerort(value: object): value is GeraetLagerort {
  return typeof (value as { art?: unknown }).art === 'string';
}

/**
 * Ein Feldwert als Anzeigetext. Leere Werte (`undefined`, `null`, leerer
 * Text, leeres Array) ergeben `undefined`.
 */
export function formatFeldwert(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (Array.isArray(value)) {
    const parts = value.map(formatFeldwert).filter((v): v is string => v !== undefined);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  if (typeof value === 'object') {
    if (isLagerort(value)) return formatFeldwert(formatLagerort(value));
    return JSON.stringify(value);
  }
  return formatFeldwert(String(value));
}

/**
 * Die Unterschiede zwischen zwei Ständen in den genannten Feldern, verglichen
 * über den Anzeigetext. Fehlt eine Seite, fehlt auch ihr Schlüssel im Eintrag.
 */
export function diffFields<T extends object>(
  before: Partial<T> | undefined,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): GeraetFeldAenderung[] {
  const result: GeraetFeldAenderung[] = [];
  for (const feld of fields) {
    const vorher = formatFeldwert(before?.[feld]);
    const nachher = formatFeldwert(after[feld]);
    if (vorher === nachher) continue;
    const entry: GeraetFeldAenderung = { feld };
    if (vorher !== undefined) entry.vorher = vorher;
    if (nachher !== undefined) entry.nachher = nachher;
    result.push(entry);
  }
  return result;
}
