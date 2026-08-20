import 'server-only';

import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchEntry,
} from '../../common/fahrtenbuch';
import {
  buildMangelDocument,
  FAHRTENBUCH_MANGEL_COLLECTION_ID,
  openMangelCount,
  type Mangel,
  type MangelActor,
} from '../../common/mangel';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { computeVehicleCache } from './entryLogic';

/**
 * Der Firestore-Zugriff auf die Mängel — bewusst getrennt von
 * `mangelActions.ts`: Aus einer `'use server'`-Datei darf nur exportiert
 * werden, was eine Action sein soll (jeder Export wird dort zu einem
 * aufrufbaren Endpunkt). Dieselbe Trennung wie bei `actionErrorKey.ts`.
 */

export function mangelRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_MANGEL_COLLECTION_ID);
}

export function entriesRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_COLLECTION_ID);
}

export function vehicleRef(groupId: string, vehicleId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID)
    .doc(vehicleId);
}

/**
 * Lädt einen Mangel und stellt sicher, dass er zur Gruppe im Pfad gehört.
 *
 * Die Dokument-ID allein ist keine Berechtigung: Der Guard der Action prüft
 * nur, ob der Benutzer Mitglied *seiner* Gruppe ist. Ohne diesen Vergleich
 * schriebe ein Mitglied von Gruppe A an einem Mangel von Gruppe B, sobald es
 * dessen ID kennt — dieselbe Prüfung wie bei `resolveFirecallDistance`.
 */
export async function loadMangel(
  groupId: string,
  mangelId: string,
): Promise<Mangel> {
  const doc = await mangelRef(groupId).doc(mangelId).get();
  if (!doc.exists) {
    throw new Error('mangelNotFound');
  }
  const mangel = { id: doc.id, ...doc.data() } as Mangel;
  if (mangel.group !== groupId) {
    throw new Error('mangelNotFound');
  }
  return mangel;
}

/**
 * Schreibt den Cache am Fahrzeug neu: jüngste Fahrt und Mängel.
 *
 * Die Fahrzeugübersicht soll Zählerstände, letzten Fahrer, Defekt-Hinweis und
 * Mängelzähler zeigen, ohne alle Fahrten und Mängel der Gruppe zu laden. Wird
 * nach jeder Mutation an einer Fahrt *oder* an einem Mangel aufgerufen, damit
 * der Cache nicht driftet.
 *
 * Beide Hälften in einem Zug und nicht in zwei Funktionen, weil sie sich
 * überschneiden: `lastEntryMangelId` sagt, ob es zur jüngsten Fahrt einen
 * Mangeldatensatz gibt, und ändert sich damit sowohl mit der Fahrt als auch
 * mit den Mängeln. Zwei Auffrischungen, die je nur ihre Hälfte kennen, ließen
 * genau die Widersprüche zu, aus denen #706 entstanden ist.
 *
 * Alle Felder werden immer gesetzt, nie weggelassen: Geschrieben wird mit
 * `merge: true`, ein fehlendes Feld ließe den alten Wert stehen.
 */
export async function refreshVehicleCache(
  groupId: string,
  vehicleId: string,
): Promise<void> {
  const [entrySnapshot, mangelSnapshot] = await Promise.all([
    entriesRef(groupId)
      .where('vehicleId', '==', vehicleId)
      .where('deleted', '==', false)
      .orderBy('abfahrt', 'desc')
      .limit(1)
      .get(),
    mangelRef(groupId).where('vehicleId', '==', vehicleId).get(),
  ]);

  const latestDoc = entrySnapshot.docs[0];
  const latest = latestDoc?.data() as FahrtenbuchEntry | undefined;
  const covering = latestDoc
    ? mangelSnapshot.docs.find(
        (doc) => (doc.data() as Mangel).entryId === latestDoc.id,
      )
    : undefined;

  await vehicleRef(groupId, vehicleId).set(
    {
      ...computeVehicleCache(latest),
      openMangelCount: openMangelCount(
        mangelSnapshot.docs.map((doc) => doc.data() as Pick<Mangel, 'status'>),
      ),
      lastEntryMangelId: covering?.id ?? null,
    },
    { merge: true },
  );
}

export interface CreateMangelForEntryArgs {
  groupId: string;
  entryId: string;
  entry: FahrtenbuchEntry;
  vehicle: { name?: string };
  actor: MangelActor;
}

/**
 * Legt den Mangel an, den eine Fahrt meldet.
 *
 * Der Mangel bekommt Zeitpunkt und Namen aus der Fahrt und nicht aus dem
 * Schreibvorgang: Gemeldet hat der Fahrer zum Zeitpunkt der Fahrt, auch wenn
 * die Fahrt erst Tage später nachgetragen wird.
 *
 * Nur beim Anlegen einer Fahrt, nicht beim Bearbeiten: Ab der Meldung hat der
 * Mangel sein eigenes Leben. Eine Korrektur an der Fahrt dürfte einen längst
 * bearbeiteten Mangel nicht zurücksetzen, und ein zweiter Mangel für dieselbe
 * Fahrt wäre eine Dublette.
 */
export async function createMangelForEntry({
  groupId,
  entryId,
  entry,
  vehicle,
  actor,
}: CreateMangelForEntryArgs): Promise<string> {
  const doc = buildMangelDocument(
    {
      vehicleId: entry.vehicleId,
      // Einträge ohne eigenen Mangeltext gibt es nur aus der Zeit vor dem Feld
      // — heute erzwingt `validateEntryInput` ihn zusammen mit dem Häkchen.
      description: entry.mangel?.trim() || entry.hinweise?.trim() || '',
      entryId,
      reportedAt: entry.abfahrt,
      reportedBy: entry.createdBy,
      reportedByName: entry.driverName,
    },
    vehicle,
    groupId,
    actor,
  );

  const ref = await mangelRef(groupId).add(doc);
  await refreshVehicleCache(groupId, entry.vehicleId);
  return ref.id;
}
