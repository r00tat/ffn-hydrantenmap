/**
 * Zusammenführen der Besatzung über mehrere BlaulichtSMS-Alarme (#835).
 *
 * BlaulichtSMS vergibt die Empfänger-ID je Alarm, nicht je Person: Wer in zwei
 * Alarmen zugesagt hat, kommt mit zwei verschiedenen IDs. Über Alarme hinweg ist
 * deshalb der normalisierte Name (`normalizePersonName`) die Kennung; innerhalb
 * eines Alarms bleibt die ID maßgeblich — zwei Empfänger desselben Alarms mit
 * gleichem Namen sind zwei Menschen.
 *
 * Rein funktional, damit `syncFromAlarms` (schreibt) und das Board (zeigt an)
 * dieselbe Zuordnung treffen.
 */
import type {
  CrewAssignment,
  CrewFunktion,
} from '../components/firebase/firestore';
import { normalizePersonName } from './fahrtenbuch';

const DEFAULT_FUNKTION: CrewFunktion = 'Feuerwehrmann';

export interface CrewRecipient {
  id: string;
  name: string;
  participation: 'yes' | 'no' | 'unknown' | 'pending';
}

/** Was von einem BlaulichtSMS-Alarm gebraucht wird. */
export interface CrewAlarm {
  recipients: readonly CrewRecipient[];
}

/** Eine Person, die in mindestens einem Alarm zugesagt hat. */
export interface ConfirmedPerson {
  /** Die ID aus dem ersten Alarm, der die Person nennt. */
  id: string;
  name: string;
  /** Alle IDs, unter denen die Person in den Alarmen vorkommt. */
  ids: string[];
  /** Normalisierter Name; leer, wenn der Name nichts hergibt. */
  key: string;
}

type CrewLike = Pick<
  CrewAssignment,
  'recipientId' | 'name' | 'source' | 'vehicleId' | 'funktion'
>;

/**
 * Von Hand angelegt: `source: 'manual'`, oder — bei Einträgen aus der Zeit vor
 * dem Feld `source` — die historische Vorsilbe `manual-` an der ID.
 */
export const isManualEntry = (a: Pick<CrewAssignment, 'source' | 'recipientId'>) =>
  a.source === 'manual' ||
  (a.source === undefined && a.recipientId.startsWith('manual-'));

/**
 * Die Vereinigung der Zusagen aller Alarme, eine Person je Eintrag.
 *
 * Ein Empfänger trifft eine schon bekannte Person über die ID oder, wenn die
 * ID neu ist, über den Namen — aber nur eine Person, die in *diesem* Alarm noch
 * nicht vergeben ist. So bleiben gleichnamige Empfänger eines Alarms getrennt.
 * Name und Haupt-ID kommen aus dem ersten Alarm, der die Person nennt.
 */
export function collectConfirmedPersons(
  alarms: CrewAlarm[],
): ConfirmedPerson[] {
  const persons: ConfirmedPerson[] = [];
  const byId = new Map<string, number>();
  const byKey = new Map<string, number[]>();

  for (const alarm of alarms) {
    const claimedInAlarm = new Set<number>();
    for (const r of alarm.recipients) {
      if (r.participation !== 'yes') continue;
      const key = normalizePersonName(r.name);
      let index = byId.get(r.id);
      if (index === undefined && key) {
        index = byKey.get(key)?.find((i) => !claimedInAlarm.has(i));
      }
      if (index === undefined) {
        index = persons.push({ id: r.id, name: r.name, ids: [r.id], key }) - 1;
        if (key) byKey.set(key, [...(byKey.get(key) ?? []), index]);
      } else if (!persons[index].ids.includes(r.id)) {
        persons[index].ids.push(r.id);
      }
      byId.set(r.id, index);
      claimedInAlarm.add(index);
    }
  }
  return persons;
}

/**
 * Die Person, zu der ein Besatzungseintrag gehört, als Index in `persons` —
 * `undefined`, wenn keine passt.
 *
 * Zuerst über die ID. Ein Eintrag, dessen ID in keinem Alarm zugesagt hat,
 * trifft eine Person über den Namen: So findet sich wieder, wer unter der ID
 * eines anderen Alarms oder von Hand eingetragen wurde. Dabei wird eine noch
 * nicht getroffene Person bevorzugt.
 */
export function matchCrewToPersons(
  assignments: Pick<CrewAssignment, 'recipientId' | 'name'>[],
  persons: ConfirmedPerson[],
): (number | undefined)[] {
  const byId = new Map<string, number>();
  const byKey = new Map<string, number[]>();
  persons.forEach((p, i) => {
    for (const id of p.ids) byId.set(id, i);
    if (p.key) byKey.set(p.key, [...(byKey.get(p.key) ?? []), i]);
  });

  const result = assignments.map((a) => byId.get(a.recipientId));
  const matched = new Set(
    result.filter((i): i is number => i !== undefined),
  );
  assignments.forEach((a, idx) => {
    if (result[idx] !== undefined) return;
    const candidates = byKey.get(normalizePersonName(a.name));
    if (!candidates) return;
    const target = candidates.find((i) => !matched.has(i)) ?? candidates[0];
    result[idx] = target;
    matched.add(target);
  });
  return result;
}

/**
 * Wie viel an einem Eintrag von Hand gemacht wurde. Ein Fahrzeug wiegt mehr
 * als eine Funktion, beides mehr als die Herkunft „von Hand".
 */
function editScore(a: CrewLike): number {
  return (
    (a.vehicleId ? 4 : 0) +
    (a.funktion && a.funktion !== DEFAULT_FUNKTION ? 2 : 0) +
    (isManualEntry(a) ? 1 : 0)
  );
}

/**
 * Der Index des Eintrags, der von mehreren Einträgen derselben Person bleibt:
 * der am meisten bearbeitete, bei Gleichstand der erste.
 */
export function pickKeeper(entries: CrewLike[]): number {
  let best = 0;
  for (let i = 1; i < entries.length; i++) {
    if (editScore(entries[i]) > editScore(entries[best])) best = i;
  }
  return best;
}

/** Schlüssel, unter dem Einträge als dieselbe Person gelten. */
function groupKeys(
  assignments: Pick<CrewAssignment, 'recipientId' | 'name'>[],
  persons: ConfirmedPerson[],
): string[] {
  const matches = matchCrewToPersons(assignments, persons);
  return assignments.map((a, i) =>
    matches[i] !== undefined ? `person:${matches[i]}` : `id:${a.recipientId}`,
  );
}

/**
 * Die Einträge, die das Board zeigt.
 *
 * Mit Alarmen: von Hand angelegte Einträge immer, aus Alarmen übernommene nur,
 * solange die Person — unter welcher ID auch immer — zugesagt hat. Ohne Alarme
 * (`null` oder leer) alle Einträge. Je Person bleibt ein Eintrag, und zwar der
 * bearbeitete, nicht einfach der erste: Bis `syncFromAlarms` aufgeräumt hat,
 * soll das Board schon zeigen, was danach übrig bleibt.
 */
export function visibleCrewAssignments<T extends CrewAssignment>(
  assignments: T[],
  alarms: CrewAlarm[] | null | undefined,
): T[] {
  const hasAlarms = !!alarms && alarms.length > 0;
  const persons = hasAlarms ? collectConfirmedPersons(alarms) : [];
  const matches = matchCrewToPersons(assignments, persons);
  const keys = groupKeys(assignments, persons);

  const groups = new Map<string, number[]>();
  assignments.forEach((a, i) => {
    if (hasAlarms && !isManualEntry(a) && matches[i] === undefined) return;
    groups.set(keys[i], [...(groups.get(keys[i]) ?? []), i]);
  });

  const keep = new Set<number>();
  for (const indices of groups.values()) {
    keep.add(indices[pickKeeper(indices.map((i) => assignments[i]))]);
  }
  return assignments.filter((_, i) => keep.has(i));
}

export interface CrewDoc {
  id: string;
  data: CrewAssignment;
}

export interface CrewSyncPlan {
  /** Dokumente, die als Duplikat wegfallen. */
  deleteIds: string[];
  /** Zuteilungen, die von einem Duplikat auf den behaltenen Eintrag wandern. */
  updates: {
    id: string;
    changes: Partial<Pick<CrewAssignment, 'vehicleId' | 'vehicleName' | 'funktion'>>;
  }[];
  /** Zugesagte Personen ohne Eintrag. */
  create: ConfirmedPerson[];
}

/**
 * Was `syncFromAlarms` an der Besatzung ändern muss.
 *
 * Mehrere Einträge derselben Person — gleiche ID oder dieselbe zugesagte
 * Person unter verschiedenen IDs — werden auf einen zurückgeführt. Es bleibt
 * der bearbeitete Eintrag; hat ein wegfallender Eintrag ein Fahrzeug oder eine
 * Funktion, die dem behaltenen fehlt, wandert sie mit, damit keine Zuteilung
 * verloren geht.
 */
export function planCrewSync(
  docs: CrewDoc[],
  persons: ConfirmedPerson[],
): CrewSyncPlan {
  const assignments = docs.map((d) => d.data);
  const matches = matchCrewToPersons(assignments, persons);
  const keys = groupKeys(assignments, persons);

  const groups = new Map<string, number[]>();
  keys.forEach((key, i) => groups.set(key, [...(groups.get(key) ?? []), i]));

  const plan: CrewSyncPlan = { deleteIds: [], updates: [], create: [] };
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const entries = indices.map((i) => assignments[i]);
    const keeperPos = pickKeeper(entries);
    const keeper = entries[keeperPos];
    const changes: CrewSyncPlan['updates'][number]['changes'] = {};
    for (const [pos, entry] of entries.entries()) {
      if (pos === keeperPos) continue;
      if (!keeper.vehicleId && !changes.vehicleId && entry.vehicleId) {
        changes.vehicleId = entry.vehicleId;
        changes.vehicleName = entry.vehicleName;
      }
      if (
        (!keeper.funktion || keeper.funktion === DEFAULT_FUNKTION) &&
        !changes.funktion &&
        entry.funktion &&
        entry.funktion !== DEFAULT_FUNKTION
      ) {
        changes.funktion = entry.funktion;
      }
      plan.deleteIds.push(docs[indices[pos]].id);
    }
    if (Object.keys(changes).length > 0) {
      plan.updates.push({ id: docs[indices[keeperPos]].id, changes });
    }
  }

  const matched = new Set(matches.filter((i): i is number => i !== undefined));
  plan.create = persons.filter((_, i) => !matched.has(i));
  return plan;
}

/**
 * Die Empfänger, die in keinem Alarm zugesagt haben — für die Auswahl
 * „Weitere Person hinzufügen". Je Person einmal, auch wenn sie in mehreren
 * Alarmen steht, und niemand, der in einem anderen Alarm zugesagt hat oder
 * schon in der Besatzung steht.
 */
export function collectUnconfirmedRecipients(
  alarms: CrewAlarm[],
  crew: Pick<CrewAssignment, 'recipientId' | 'name'>[],
): CrewRecipient[] {
  const persons = collectConfirmedPersons(alarms);
  const takenIds = new Set([
    ...crew.map((a) => a.recipientId),
    ...persons.flatMap((p) => p.ids),
  ]);
  const takenKeys = new Set(
    [...crew.map((a) => normalizePersonName(a.name)), ...persons.map((p) => p.key)]
      .filter(Boolean),
  );

  const result: CrewRecipient[] = [];
  for (const alarm of alarms) {
    for (const r of alarm.recipients) {
      if (r.participation === 'yes' || takenIds.has(r.id)) continue;
      const key = normalizePersonName(r.name);
      if (key && takenKeys.has(key)) continue;
      takenIds.add(r.id);
      if (key) takenKeys.add(key);
      result.push({ id: r.id, name: r.name, participation: r.participation });
    }
  }
  return result;
}
