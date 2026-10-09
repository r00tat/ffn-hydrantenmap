'use client';

import { collection, doc, type UpdateData } from 'firebase/firestore';
import { GERAET_EINSATZ_COLLECTION, type GeraetEinsatz } from '../../../common/geraet';
import type { VerbrauchExpectation } from '../../../common/geraetBestandLogic';
import { isOffline } from '../../../lib/connectivity';
import {
  addDocLocal,
  deleteDocLocal,
  updateDocLocal,
} from '../../../lib/firestoreClient';
import { waitForFirestoreSync } from '../../../lib/firestoreSync';
import { firestore } from '../../firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../../firebase/firestore';
import {
  enqueueGeraetVerbrauchSync,
  isGeraetVerbrauchQueued,
  queueGeraetVerbrauchSync,
} from '../geraetVerbrauchQueue';
import {
  enqueueGeraetZuordnungSync,
  queueGeraetZuordnungSync,
} from '../geraetZuordnungQueue';
import { isPendingBooking } from './geraetEinsatzLogic';

/**
 * Schreibvorgänge des Abschnitts „Geräte & Material" im Einsatz.
 *
 * Der Eintrag geht lokal nach `call/{firecallId}/geraetEinsatz` und ist sofort
 * sichtbar, auch offline; kein Dialog wartet auf den Server (siehe
 * docs/offline-modus.md). Das Abbuchen vom Lager macht der Server: Nach jedem
 * Anlegen, Ändern und Löschen eines Verbrauchs gleicht `syncGeraetVerbrauch`
 * den Bestand mit dem Eintrag ab — online sofort, offline über die
 * Warteschlange beim Reconnect. Der Abgleich ist idempotent, ein doppelter
 * Aufruf schadet nicht. Ebenso protokolliert `syncGeraetZuordnung` nach dem
 * Anlegen und Löschen einer Zuordnung den Eintrag in der Historie des Artikels.
 *
 * Jedes Anlegen und Ändern setzt `syncRev` neu; der Abgleich nimmt ihn (oder
 * „gelöscht") als Erwartung mit. Sieht der Server einen älteren Stand, lehnt
 * er ab, und die Warteschlange wiederholt — so bucht er nie einen Stand, den
 * der Client schon überschrieben hat.
 */

function entryCollection(firecallId: string) {
  return collection(firestore, FIRECALL_COLLECTION_ID, firecallId, GERAET_EINSATZ_COLLECTION);
}

function entryDoc(firecallId: string, entryId: string) {
  return doc(firestore, FIRECALL_COLLECTION_ID, firecallId, GERAET_EINSATZ_COLLECTION, entryId);
}

let lastSyncRev = 0;

/** Abgleiche, die gerade laufen (`firecallId/entryId`). */
const inFlight = new Set<string>();

/**
 * Ein neuer, streng wachsender Stand. Die Uhrzeit, damit ein später auf einem
 * anderen Gerät geänderter Eintrag in der Regel einen höheren Stand trägt;
 * streng wachsend, damit zwei Änderungen in derselben Millisekunde
 * unterscheidbar bleiben.
 */
export function nextSyncRev(now = Date.now()): number {
  lastSyncRev = Math.max(now, lastSyncRev + 1);
  return lastSyncRev;
}

/**
 * Führt einen Abgleich aus, ohne dass der Aufrufer wartet.
 *
 * Online wird erst auf die Übertragung der lokalen Schreibvorgänge gewartet:
 * Der Server liest den Eintrag per Admin SDK. Läuft die Zeit dabei ab, oder
 * scheitert der Aufruf bei erreichbarem Server (Zeitüberschreitung, Konflikt
 * in der Transaktion, Eintrag noch nicht angekommen), kommt der Abgleich in
 * die Warteschlange — sie wiederholt mit wachsendem Abstand und meldet am
 * Ende in der Fehlerliste. Verloren geht er so nicht.
 */
async function runSyncOrEnqueue(
  what: string,
  run: () => Promise<unknown>,
  enqueueSync: () => Promise<void>,
): Promise<void> {
  try {
    if (!isOffline() && !(await waitForFirestoreSync())) {
      await enqueueSync();
      return;
    }
    try {
      await run();
    } catch (err) {
      console.warn(`geraetEinsatz: ${what} failed, queued`, err);
      await enqueueSync();
    }
  } catch (err: unknown) {
    console.warn(`geraetEinsatz: ${what} could not be queued`, err);
  }
}

/** Stößt den Abgleich des Verbrauchs an (siehe `runSyncOrEnqueue`). */
export function requestVerbrauchSync(
  firecallId: string,
  entryId: string,
  expect?: VerbrauchExpectation,
): void {
  const key = `${firecallId}/${entryId}`;
  inFlight.add(key);
  void runSyncOrEnqueue(
    `sync of ${key}`,
    () => queueGeraetVerbrauchSync(firecallId, entryId, expect),
    () => enqueueGeraetVerbrauchSync(firecallId, entryId, expect),
  ).finally(() => inFlight.delete(key));
}

/**
 * Stößt das Protokoll einer Zuordnung an. Ohne Erwartung: Die Action liest
 * den aktuellen Stand und schreibt nur, was fehlt.
 */
function requestZuordnungSync(firecallId: string, entryId: string): void {
  void runSyncOrEnqueue(
    `zuordnung log of ${firecallId}/${entryId}`,
    () => queueGeraetZuordnungSync(firecallId, entryId),
    () => enqueueGeraetZuordnungSync(firecallId, entryId),
  );
}

/**
 * Sicherheitsnetz für einen Verbrauch, der „noch nicht gebucht" ist, obwohl
 * kein Abgleich mehr unterwegs ist — etwa weil die App zwischen dem lokalen
 * Schreiben und dem Anstoßen geschlossen wurde. Stößt den Abgleich erneut an,
 * außer er läuft gerade oder wartet schon in der Warteschlange. Liefert, ob
 * angestoßen wurde.
 *
 * Erwartet wird der Stand, den dieses Gerät vom Eintrag sieht: Der Aufrufer
 * ruft nur für Einträge ohne offenen lokalen Schreibvorgang auf, der Server
 * kennt diesen Stand also schon.
 */
export function resyncPendingBooking(firecallId: string, entry: GeraetEinsatz): boolean {
  if (!isPendingBooking(entry)) return false;
  if (inFlight.has(`${firecallId}/${entry.id}`)) return false;
  if (isGeraetVerbrauchQueued(firecallId, entry.id)) return false;
  requestVerbrauchSync(firecallId, entry.id, { syncRev: entry.syncRev ?? 0 });
  return true;
}

/** Legt den Eintrag lokal an und gibt seine ID sofort zurück. */
export function addGeraetEinsatz(
  firecallId: string,
  data: Omit<GeraetEinsatz, 'id'>,
): string {
  const syncRev = nextSyncRev();
  const ref = addDocLocal(entryCollection(firecallId), { ...data, syncRev });
  if (data.art === 'verbraucht') requestVerbrauchSync(firecallId, ref.id, { syncRev });
  if (data.art === 'zugeordnet') requestZuordnungSync(firecallId, ref.id);
  return ref.id;
}

export function updateGeraetEinsatz(
  firecallId: string,
  entry: GeraetEinsatz,
  patch: UpdateData<Omit<GeraetEinsatz, 'id'>> | Record<string, unknown>,
): void {
  const syncRev = nextSyncRev();
  updateDocLocal(entryDoc(firecallId, entry.id), {
    ...patch,
    syncRev,
  } as UpdateData<Omit<GeraetEinsatz, 'id'>>);
  if (entry.art === 'verbraucht') requestVerbrauchSync(firecallId, entry.id, { syncRev });
}

/**
 * Löscht den Eintrag. Ein Verbrauch wird beim Abgleich zurückgebucht: Ohne
 * Eintrag ist das Ziel „nichts verbraucht". Bei einer Zuordnung kommt das
 * Ende der Zuordnung ins Protokoll.
 */
export function deleteGeraetEinsatz(firecallId: string, entry: GeraetEinsatz): void {
  deleteDocLocal(entryDoc(firecallId, entry.id));
  if (entry.art === 'verbraucht') {
    requestVerbrauchSync(firecallId, entry.id, { deleted: true });
  }
  if (entry.art === 'zugeordnet') requestZuordnungSync(firecallId, entry.id);
}
