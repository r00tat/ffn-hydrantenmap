import type { FirecallItem } from '../firebase/firestore';
import { parentMap } from './unit-tree';

/** Reihenfolge der Einsatzmittel innerhalb einer Ebene. */
export type EinsatzmittelSortMode = 'time' | 'fw' | 'unit';

export const EINSATZMITTEL_SORT_MODES: readonly EinsatzmittelSortMode[] = [
  'time',
  'fw',
  'unit',
];

type SortableItem = FirecallItem & { fw?: string; tacticalUnitId?: string };

// „FF 2" vor „FF 10", Groß- und Kleinschreibung egal.
const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Leere Werte ans Ende, sonst alphabetisch. */
function compareText(a: string | undefined, b: string | undefined): number {
  const left = a?.trim() ?? '';
  const right = b?.trim() ?? '';
  if (!left || !right) return Number(!left) - Number(!right);
  return collator.compare(left, right);
}

function compareTime(a: FirecallItem, b: FirecallItem): number {
  return a.datum?.localeCompare(b.datum || '') || 0;
}

/**
 * Namen der Einheiten von oben bis zum Element: für ein Fahrzeug die Kette
 * über ihm, für eine Einheit samt ihr selbst. Leer ohne Einheit.
 */
function unitPath(
  item: SortableItem,
  parents: Map<string, string>,
  byId: Map<string, FirecallItem>,
): string[] {
  const path: string[] = [];
  let current: string | undefined =
    item.type === 'tacticalUnit' ? item.id : item.id && parents.get(item.id);
  while (current) {
    path.unshift(byId.get(current)?.name ?? '');
    current = parents.get(current);
  }
  return path;
}

function comparePath(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return Number(a.length === 0) - Number(b.length === 0);
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const result = collator.compare(a[i], b[i]);
    if (result !== 0) return result;
  }
  // Die Einheit vor dem, was unter ihr steht.
  return a.length - b.length;
}

/**
 * Sortiert die Einsatzmittel einer Ebene. `allItems` sind alle Elemente des
 * Einsatzes: Die Einheit über einem Fahrzeug kann auf einer anderen Ebene
 * liegen, ihr Name bestimmt trotzdem den Platz.
 */
export function sortEinsatzmittel(
  items: FirecallItem[],
  mode: EinsatzmittelSortMode,
  allItems: FirecallItem[] = items,
): FirecallItem[] {
  const sorted = [...items] as SortableItem[];
  if (mode === 'time') return sorted.sort(compareTime);

  if (mode === 'fw') {
    return sorted.sort(
      (a, b) => compareText(a.fw, b.fw) || compareText(a.name, b.name),
    );
  }

  const parents = parentMap(allItems as SortableItem[]);
  const byId = new Map(
    allItems.filter((i) => i.id).map((i) => [i.id!, i] as const),
  );
  const paths = new Map(
    sorted.map((i) => [i, unitPath(i, parents, byId)] as const),
  );
  return sorted.sort(
    (a, b) =>
      comparePath(paths.get(a)!, paths.get(b)!) ||
      // Bei gleicher Kette steht die Einheit selbst vor ihren Fahrzeugen.
      Number(b.type === 'tacticalUnit') - Number(a.type === 'tacticalUnit') ||
      compareText(a.name, b.name),
  );
}
