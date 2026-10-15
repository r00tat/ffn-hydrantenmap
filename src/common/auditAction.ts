import type { AuditLogEntry } from '../components/firebase/firestore';

export type AuditAction = AuditLogEntry['action'];

/**
 * Welche Aktion ein Schreibvorgang über `useFirecallItemUpdate` im Audit-Log
 * ist. Gelöscht wird weich (`deleted: true`), technisch also ein Update — im
 * Protokoll soll es trotzdem als Löschen stehen, und das Zurückholen eines
 * gelöschten Elements als Wiederherstellen.
 */
export function auditActionForUpdate(
  previous: { deleted?: boolean } | undefined,
  next: { deleted?: boolean }
): AuditAction {
  const wasDeleted = previous?.deleted === true;
  const isDeleted = next.deleted === true;
  if (isDeleted && !wasDeleted) return 'delete';
  if (!isDeleted && wasDeleted) return 'restore';
  return 'update';
}

/**
 * Element-Typen im Audit-Log, die keine Elemente unter `item`/`layer` sind
 * und sich deshalb nicht über die Element-Wiederherstellung zurückholen lassen.
 */
const NON_ITEM_ELEMENT_TYPES = new Set([
  'firecall',
  'location',
  'kostenersatz',
  'mapLayer',
]);

/** Lässt sich der Vorzustand dieses Audit-Eintrags wiederherstellen? */
export function isRestorableAuditEntry(entry: AuditLogEntry): boolean {
  return (
    (entry.action === 'update' || entry.action === 'delete') &&
    !!entry.previousValue &&
    !!entry.elementId &&
    !NON_ITEM_ELEMENT_TYPES.has(entry.elementType)
  );
}

/** Felder, die am Objekt hängen, aber nicht ins Firestore-Dokument gehören. */
const TRANSIENT_FIELDS = new Set([
  'id',
  'original',
  'eventHandlers',
  'deletedWithLayer',
]);

/**
 * Die Daten, die beim Wiederherstellen eines Elements geschrieben werden: der
 * gespeicherte Stand ohne flüchtige Felder, nicht gelöscht, mit Bearbeiter.
 */
export function restoreData(
  item: Record<string, unknown>,
  { now, user }: { now: string; user?: string }
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (TRANSIENT_FIELDS.has(key) || value === undefined) continue;
    data[key] = value;
  }
  return {
    ...data,
    deleted: false,
    updatedAt: now,
    ...(user ? { updatedBy: user } : {}),
  };
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Macht einen Wert für einen Audit-Eintrag schreibbar. Firestore lehnt
 * `undefined`, Funktionen und verschachtelte Arrays ab — und zwar für den
 * ganzen Eintrag. Weil der Audit-Log-Fehler bewusst nur in der Konsole landet,
 * fehlte so jede Änderung, deren Vor- oder Nachher-Stand ein leeres Feld
 * hatte (z.B. `rotation` vor der ersten Drehung).
 *
 * Firestore-Typen (Timestamp, GeoPoint, FieldValue) bleiben, wie sie sind;
 * andere Klasseninstanzen werden als JSON übernommen.
 */
export function sanitizeAuditValue(value: unknown, nested = false): unknown {
  if (value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    // Ein Array im Array kann Firestore nicht speichern.
    if (nested) return JSON.stringify(value);
    return value
      .map((v) => sanitizeAuditValue(v, true))
      .filter((v) => v !== undefined);
  }
  if (!isPlainObject(value)) {
    if ('toDate' in value || 'isEqual' in value) return value;
    try {
      return sanitizeAuditValue(JSON.parse(JSON.stringify(value)), nested);
    } catch {
      return undefined;
    }
  }
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const clean = sanitizeAuditValue(v, false);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
}

/** Felder, die sich bei jedem Schreiben ändern und nichts über die Änderung sagen. */
const BOOKKEEPING_FIELDS = new Set(['updatedAt', 'updatedBy']);

/**
 * Die Felder, die sich zwischen Vor- und Nachher-Stand eines Audit-Eintrags
 * unterscheiden, alphabetisch. Fehlt einer der Stände, gibt es nichts zu
 * vergleichen.
 */
export function changedFields(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): string[] {
  if (!previous || !next) return [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys]
    .filter((key) => !BOOKKEEPING_FIELDS.has(key))
    .filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key])
    )
    .sort();
}
