import type { GroupTreeEntry, HierarchyGroup } from '../../common/groupHierarchy';

export interface VisibleGroupRow<T> extends GroupTreeEntry<T> {
  hasChildren: boolean;
  /** Untergruppen sichtbar — bei aktiver Suche immer. */
  expanded: boolean;
}

/**
 * Die sichtbaren Zeilen der Gruppenübersicht aus der Baumreihenfolge
 * (`orderGroupsAsTree`). Ohne Suche fallen die Untergruppen zugeklappter
 * Gruppen weg. Mit Suche bleiben die Treffer (Name oder Beschreibung) samt
 * ihrer Elterngruppen stehen, damit der Weg im Baum erkennbar bleibt.
 */
export function visibleGroupTree<
  T extends HierarchyGroup & { description?: string },
>(
  tree: GroupTreeEntry<T>[],
  search: string,
  collapsed: Set<string>
): VisibleGroupRow<T>[] {
  const rows = tree.map((entry, index) => ({
    ...entry,
    hasChildren: tree[index + 1]?.depth > entry.depth,
  }));

  const query = search.trim().toLocaleLowerCase();
  if (query) {
    const keep = new Set<number>();
    rows.forEach((row, index) => {
      const text = `${row.group.name} ${row.group.description ?? ''}`;
      if (!text.toLocaleLowerCase().includes(query)) return;
      keep.add(index);
      // Elterngruppen: rückwärts jeweils die nächste Zeile mit kleinerer Tiefe.
      let depth = row.depth;
      for (let i = index - 1; i >= 0 && depth > 0; i--) {
        if (rows[i].depth < depth) {
          keep.add(i);
          depth = rows[i].depth;
        }
      }
    });
    return rows
      .filter((_, index) => keep.has(index))
      .map((row) => ({ ...row, expanded: true }));
  }

  const result: VisibleGroupRow<T>[] = [];
  let hiddenBelow: number | undefined;
  for (const row of rows) {
    if (hiddenBelow !== undefined && row.depth > hiddenBelow) continue;
    hiddenBelow = undefined;
    const expanded = !(row.group.id && collapsed.has(row.group.id));
    if (!expanded) hiddenBelow = row.depth;
    result.push({ ...row, expanded });
  }
  return result;
}
