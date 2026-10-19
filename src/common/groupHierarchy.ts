import { isTenantGroupId } from './tenantGroups';

/**
 * Hierarchie der Gruppen: Eine Gruppe kann über `parentId` unter einer anderen
 * stehen (etwa Bezirk → Abschnitt → Feuerwehr).
 *
 * Wer Mitglied einer Gruppe ist, ist auch Mitglied aller Gruppen darüber. Das
 * wird beim **Vergeben** sichergestellt — die Elterngruppen landen ganz normal
 * in `groupRoles` am Benutzer. Die Auswertung (Claims, Firestore-Regeln,
 * Guards) kennt die Hierarchie deshalb nicht und muss es auch nicht.
 *
 * Alle Funktionen sind gegen Zyklen und fehlende Elterngruppen abgesichert:
 * Daten in Firestore können inkonsistent sein, auch wenn die Server Action
 * beim Speichern einen Zyklus ablehnt.
 */
export interface HierarchyGroup {
  id?: string;
  name: string;
  parentId?: string | null;
}

function parentsById(groups: HierarchyGroup[]): Map<string, string> {
  const parents = new Map<string, string>();
  for (const group of groups) {
    if (group.id && group.parentId) parents.set(group.id, group.parentId);
  }
  return parents;
}

/** Die Elterngruppen, die nächste zuerst. Fehlende Eltern beenden die Kette. */
export function ancestorGroupIds(
  groupId: string,
  groups: HierarchyGroup[]
): string[] {
  const parents = parentsById(groups);
  const known = new Set(groups.map((g) => g.id).filter(Boolean));
  const result: string[] = [];
  const seen = new Set([groupId]);
  let current = parents.get(groupId);
  while (current && known.has(current) && !seen.has(current)) {
    result.push(current);
    seen.add(current);
    current = parents.get(current);
  }
  return result;
}

/** Alle Gruppen unterhalb, in beliebiger Reihenfolge. */
export function descendantGroupIds(
  groupId: string,
  groups: HierarchyGroup[]
): string[] {
  const children = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.id || !group.parentId) continue;
    children.set(group.parentId, [
      ...(children.get(group.parentId) ?? []),
      group.id,
    ]);
  }
  const result: string[] = [];
  const seen = new Set([groupId]);
  const queue = [...(children.get(groupId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

/**
 * Die Gruppen samt aller Elterngruppen, jede einmal. Die übergebenen stehen
 * vorne in ihrer Reihenfolge, die ergänzten dahinter.
 */
export function withAncestorGroups(
  groupIds: string[],
  groups: HierarchyGroup[]
): string[] {
  const result = [...new Set(groupIds)];
  for (const groupId of groupIds) {
    for (const ancestor of ancestorGroupIds(groupId, groups)) {
      if (!result.includes(ancestor)) result.push(ancestor);
    }
  }
  return result;
}

/**
 * Die Gruppen, die sich aus der Auswahl zwingend ergeben — die Eltern der
 * gewählten Gruppen. In der Oberfläche sind sie angehakt und gesperrt.
 */
export function impliedGroupIds(
  groupIds: string[],
  groups: HierarchyGroup[]
): Set<string> {
  return new Set(
    groupIds.flatMap((groupId) => ancestorGroupIds(groupId, groups))
  );
}

/**
 * Darf `parentId` Elterngruppe von `groupId` werden? Keine Elterngruppe ist
 * immer erlaubt. Sonst muss sie existieren, ein Mandant sein und darf weder
 * die Gruppe selbst noch eine ihrer Untergruppen sein — das ergäbe einen
 * Zyklus. `groupId` fehlt bei einer neuen Gruppe, die noch keine Kinder hat.
 */
export function isValidParent(
  groupId: string | undefined,
  parentId: string | null | undefined,
  groups: HierarchyGroup[]
): boolean {
  if (!parentId) return true;
  if (!isTenantGroupId(parentId)) return false;
  if (groupId && !isTenantGroupId(groupId)) return false;
  if (!groups.some((g) => g.id === parentId)) return false;
  if (!groupId) return true;
  return (
    parentId !== groupId && !descendantGroupIds(groupId, groups).includes(parentId)
  );
}

export interface GroupTreeEntry<T> {
  group: T;
  /** 0 für Gruppen ohne (vorhandene) Elterngruppe. */
  depth: number;
}

/**
 * Die Gruppen in Baumreihenfolge: jede Gruppe direkt gefolgt von ihren
 * Untergruppen, Geschwister nach `compare` (Standard: Name). Eine Gruppe,
 * deren Elterngruppe nicht in der Liste steht, ist eine Wurzel — so zeigt die
 * Liste „meine Gruppen" auch dann alles, wenn eine Elterngruppe fehlt.
 */
export function orderGroupsAsTree<T extends HierarchyGroup>(
  groups: T[],
  compare: (a: T, b: T) => number = (a, b) =>
    (a.name || '').localeCompare(b.name || '')
): GroupTreeEntry<T>[] {
  const ids = new Set(groups.map((g) => g.id).filter(Boolean));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const group of groups) {
    if (group.parentId && ids.has(group.parentId) && group.parentId !== group.id) {
      children.set(group.parentId, [
        ...(children.get(group.parentId) ?? []),
        group,
      ]);
    } else {
      roots.push(group);
    }
  }

  const result: GroupTreeEntry<T>[] = [];
  const visited = new Set<T>();
  const visit = (group: T, depth: number) => {
    if (visited.has(group)) return;
    visited.add(group);
    result.push({ group, depth });
    for (const child of [...(group.id ? children.get(group.id) ?? [] : [])].sort(
      compare
    )) {
      visit(child, depth + 1);
    }
  };
  for (const root of [...roots].sort(compare)) visit(root, 0);
  // Gruppen in einem Zyklus erreicht keine Wurzel; sie hängen hinten an,
  // damit keine Gruppe aus der Anzeige verschwindet.
  for (const group of [...groups].sort(compare)) visit(group, 0);
  return result;
}

/**
 * Die fehlenden Elterngruppen je Benutzer. Leer, wenn die Mitgliedschaften
 * zur Hierarchie passen.
 */
export function planAncestorMemberships(
  users: { uid: string; groupIds: string[] }[],
  groups: HierarchyGroup[]
): { uid: string; groupIds: string[] }[] {
  const result: { uid: string; groupIds: string[] }[] = [];
  for (const { uid, groupIds } of users) {
    const missing = withAncestorGroups(groupIds, groups).filter(
      (groupId) => !groupIds.includes(groupId)
    );
    if (missing.length) result.push({ uid, groupIds: missing });
  }
  return result;
}
