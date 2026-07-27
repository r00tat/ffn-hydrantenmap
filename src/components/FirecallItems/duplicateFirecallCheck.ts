export interface ExistingFirecall {
  id: string;
  name: string;
}

/**
 * Determines which firecalls are already linked to any of the given alarm ids.
 *
 * Used by the Einsatz dialog to warn before a second firecall is created for an
 * alarm that already has one — the situation that produced duplicate Einsätze
 * where crew, diary entries and Kostenersatz ended up split across two
 * documents.
 *
 * `excludeFirecallId` keeps the firecall currently being edited out of the
 * result, so editing an existing Einsatz never warns about itself.
 */
export function findExistingFirecallsForAlarms(
  alarmIds: string[],
  firecallsByAlarmId: Record<string, ExistingFirecall>,
  excludeFirecallId?: string,
): ExistingFirecall[] {
  const found: ExistingFirecall[] = [];
  const seen = new Set<string>();

  for (const alarmId of alarmIds) {
    const firecall = firecallsByAlarmId[alarmId];
    if (!firecall?.id) continue;
    if (firecall.id === excludeFirecallId) continue;
    if (seen.has(firecall.id)) continue;
    seen.add(firecall.id);
    found.push(firecall);
  }

  return found;
}
