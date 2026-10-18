/**
 * Die Gliederung der Einsatzmittel als Baum: Ein Fahrzeug hängt an einer
 * taktischen Einheit, eine Einheit an einer anderen — etwa eine
 * KHD-Bereitschaft mit zwei Zügen, darunter deren Fahrzeuge. Beide tragen
 * dafür `tacticalUnitId`.
 *
 * Alle Stellen, die den Baum lesen (Stärke, Versetzen, Übersicht), gehen über
 * `parentMap`, damit sie Verweise gleich behandeln: Ein Verweis auf eine
 * Einheit, die nicht (mehr) im Einsatz steht, oder ein Zyklus in den Daten
 * gilt als „ohne Einheit". Ein Zyklus lässt sich in der Oberfläche nicht
 * anlegen (`parentCandidates`), kann aber durch zwei gleichzeitige
 * Änderungen auf verschiedenen Geräten entstehen.
 */

export interface TreeItem {
  id?: string;
  type?: string;
  tacticalUnitId?: string;
}

/** Element-ID → ID der Einheit darüber, nur für gültige Verweise. */
export function parentMap(items: TreeItem[]): Map<string, string> {
  const unitIds = new Set(
    items.filter((i) => i.type === 'tacticalUnit' && i.id).map((i) => i.id),
  );
  const raw = new Map<string, string>();
  for (const item of items) {
    if (item.id && item.tacticalUnitId && unitIds.has(item.tacticalUnitId)) {
      raw.set(item.id, item.tacticalUnitId);
    }
  }

  const result = new Map<string, string>();
  for (const [id, parent] of raw) {
    // Führt die Kette nach oben zurück zum Element, ist es Teil eines Zyklus.
    // Endet sie in einem Zyklus ohne das Element, bleibt sein Verweis: Die
    // Einheit im Zyklus steht dann selbst oben.
    const seen = new Set([id]);
    let current: string | undefined = parent;
    while (current && !seen.has(current)) {
      seen.add(current);
      current = raw.get(current);
    }
    if (current !== id) result.set(id, parent);
  }
  return result;
}

/** Einheit-ID → die Elemente direkt darunter, in der Reihenfolge von `items`. */
export function childrenMap(
  items: TreeItem[],
  parents: Map<string, string> = parentMap(items),
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const item of items) {
    const parent = item.id && parents.get(item.id);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), item.id!]);
  }
  return children;
}

/** Alles unterhalb des Elements über alle Ebenen, Tiefe zuerst. */
export function descendantIds(id: string, items: TreeItem[]): string[] {
  const children = childrenMap(items);
  const result: string[] = [];
  const visit = (parent: string) => {
    for (const child of children.get(parent) ?? []) {
      result.push(child);
      visit(child);
    }
  };
  visit(id);
  return result;
}

/**
 * Die Einheiten, unter die das Element gestellt werden kann. Einer Einheit
 * fehlen sie selbst und alles unter ihr — sonst entstünde ein Zyklus.
 */
export function parentCandidates<T extends TreeItem>(
  id: string | undefined,
  items: T[],
): T[] {
  const excluded = new Set(id ? [id, ...descendantIds(id, items)] : []);
  return items.filter(
    (i) => i.type === 'tacticalUnit' && i.id && !excluded.has(i.id),
  );
}
