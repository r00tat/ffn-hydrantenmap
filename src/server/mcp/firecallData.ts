import 'server-only';

import {
  projectFirecall,
  projectFirecallItem,
  type FirecallDto,
  type FirecallItemDto,
} from '../../common/mcp/itemDto';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  type Firecall,
  type FirecallItem,
} from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';
import type { McpUser } from './userAccess';

/**
 * Lesende Zugriffe des MCP-Servers.
 *
 * **Harte Obergrenzen überall.** `FirecallItem` und `Firecall` haben beide
 * `[key: string]: any`, die Dokumente sind fett, und ein Einsatz kann Tausende
 * Elemente haben. Eine unbegrenzte Antwort sprengte jeden Modellkontext und
 * verließe die Anwendung mit Daten, die niemand angefragt hat. Herausgegeben
 * wird immer die Projektion aus `itemDto.ts`, nie das Rohdokument.
 */

export const MAX_ITEMS = 200;
export const MAX_ENTRIES = 100;
export const MAX_FIRECALLS = 50;

export interface ListFirecallsOptions {
  /** Nur Einsätze dieser Gruppe; ohne Angabe alle Gruppen des Benutzers. */
  group?: string;
  /** Auch abgeschlossene Einsätze (mit `abruecken`) einschließen. */
  includeFinished?: boolean;
  limit?: number;
}

/**
 * Die Einsätze, die dieser Benutzer sehen darf.
 *
 * Gefiltert wird über die Gruppen des Benutzers — dieselbe Schranke wie in
 * `verifyUserAuthorizedForFirecall`, nur als Abfrage statt als Prüfung. Ein
 * Token kann daran nichts ändern: Die Gruppen kommen aus dem Benutzerdokument,
 * nicht aus dem Token.
 */
export async function listFirecalls(
  user: McpUser,
  { group, includeFinished = false, limit = 20 }: ListFirecallsOptions = {},
): Promise<FirecallDto[]> {
  const groups = group
    ? user.groups.filter((entry) => entry === group)
    : user.groups;
  if (groups.length === 0) {
    return [];
  }

  // Firestore erlaubt höchstens 30 Werte je `in`-Vergleich. Mehr Gruppen als
  // das hat hier niemand; sollte es doch je so weit kommen, ist eine stumme
  // Kürzung besser als ein Fehler mitten im Einsatz.
  const snapshot = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .where('group', 'in', groups.slice(0, 30))
    .orderBy('date', 'desc')
    .limit(Math.min(limit, MAX_FIRECALLS) * 2)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Firecall) }))
    .filter((firecall) => firecall.deleted !== true)
    .filter((firecall) => includeFinished || !firecall.abruecken)
    .slice(0, Math.min(limit, MAX_FIRECALLS))
    .map(projectFirecall);
}

/** Ein einzelner Einsatz — der Aufrufer hat bereits `verifyUserAuthorizedForFirecall` bestanden. */
export async function getFirecall(firecallId: string): Promise<FirecallDto> {
  const doc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();
  if (!doc.exists) {
    throw new Error(`firecall ${firecallId} does not exist`);
  }
  return projectFirecall({ id: doc.id, ...(doc.data() as Firecall) });
}

function itemsCollection(firecallId: string) {
  return firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(FIRECALL_ITEMS_COLLECTION_ID);
}

/** Die Rohdokumente eines Einsatzes — für die Tool-Handler, nicht für Antworten. */
export async function loadFirecallItems(
  firecallId: string,
  limit = MAX_ITEMS,
): Promise<FirecallItem[]> {
  const snapshot = await itemsCollection(firecallId).limit(limit).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as FirecallItem) }))
    .filter((item) => item.deleted !== true);
}

export interface ListItemsOptions {
  types?: string[];
  limit?: number;
}

export async function listItems(
  firecallId: string,
  { types, limit = 100 }: ListItemsOptions = {},
): Promise<FirecallItemDto[]> {
  const capped = Math.min(limit, MAX_ITEMS);
  let query = itemsCollection(firecallId).limit(capped * 2);
  if (types && types.length > 0 && types.length <= 30) {
    query = itemsCollection(firecallId)
      .where('type', 'in', types)
      .limit(capped * 2);
  }
  const snapshot = await query.get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as FirecallItem) }))
    .filter((item) => item.deleted !== true)
    .filter((item) => !types || types.includes(item.type))
    .slice(0, capped)
    .map((item) => projectFirecallItem(item, { includeDescription: true }));
}

export interface ListEntriesOptions {
  limit?: number;
  /** Für die Seitenweise: Einträge vor diesem ISO-Zeitstempel. */
  before?: string;
}

/**
 * Einsatztagebuch bzw. Geschäftsbuch, neueste zuerst.
 *
 * Sortiert und gefiltert wird im Speicher statt über eine Firestore-Abfrage:
 * `datum` ist eine ISO-Zeichenkette und über die Bestandsdaten hinweg nicht
 * lückenlos gesetzt. Eine `orderBy('datum')`-Abfrage ließe Einträge ohne Datum
 * ersatzlos weg — im Einsatztagebuch wäre das ein stiller Datenverlust.
 */
async function listEntries(
  firecallId: string,
  type: 'diary' | 'gb',
  { limit = 50, before }: ListEntriesOptions = {},
): Promise<FirecallItemDto[]> {
  const snapshot = await itemsCollection(firecallId)
    .where('type', '==', type)
    .limit(MAX_ENTRIES * 4)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as FirecallItem) }))
    .filter((item) => item.deleted !== true)
    .filter((item) => !before || (item.datum ?? '') < before)
    .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
    .slice(0, Math.min(limit, MAX_ENTRIES))
    .map((item) => projectFirecallItem(item, { includeDescription: true }));
}

export function listDiaryEntries(
  firecallId: string,
  options?: ListEntriesOptions,
) {
  return listEntries(firecallId, 'diary', options);
}

export function listGeschaeftsbuchEntries(
  firecallId: string,
  options?: ListEntriesOptions,
) {
  return listEntries(firecallId, 'gb', options);
}

export async function listLayers(firecallId: string): Promise<FirecallItemDto[]> {
  const snapshot = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(FIRECALL_LAYERS_COLLECTION_ID)
    .limit(MAX_ITEMS)
    .get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as FirecallItem) }))
    .filter((item) => item.deleted !== true)
    .map((item) => projectFirecallItem(item));
}

export interface FirecallContext {
  firecall: FirecallDto;
  counts: Record<string, number>;
  items: FirecallItemDto[];
  layers: FirecallItemDto[];
  latestDiary: FirecallItemDto[];
}

/**
 * Der verdichtete Gesamtkontext eines Einsatzes.
 *
 * Entspricht dem, was `contextBuilder.ts` für den Browser-Assistenten baut —
 * ohne Kartenausschnitt und Benutzerposition, die es hier nicht gibt, dafür
 * mit den Zählern je Typ. Ein Client, der einen Einsatz „verstehen" will,
 * braucht sonst fünf Aufrufe.
 */
export async function getFirecallContext(
  firecallId: string,
): Promise<FirecallContext> {
  const [firecall, rawItems, layers, latestDiary] = await Promise.all([
    getFirecall(firecallId),
    loadFirecallItems(firecallId, MAX_ITEMS * 2),
    listLayers(firecallId),
    listDiaryEntries(firecallId, { limit: 20 }),
  ]);

  const counts: Record<string, number> = {};
  for (const item of rawItems) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }

  // Tagebuch und Geschäftsbuch stehen als eigene Listen bzw. Tools zur
  // Verfügung — im Gesamtkontext würden sie nur den Platz der Lage fressen.
  const items = rawItems
    .filter((item) => item.type !== 'diary' && item.type !== 'gb')
    .slice(0, MAX_ITEMS)
    .map((item) => projectFirecallItem(item));

  return { firecall, counts, items, layers, latestDiary };
}
