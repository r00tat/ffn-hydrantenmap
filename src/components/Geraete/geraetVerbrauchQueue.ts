'use client';

import type { VerbrauchExpectation } from '../../common/geraetBestandLogic';
import {
  enqueue,
  getQueueSnapshot,
  processQueue,
  registerQueueHandler,
  runOrQueue,
  type EnqueueOptions,
} from '../../lib/offlineQueue';
import { syncGeraetVerbrauch } from './geraeteActions';

/**
 * Abgleich des Verbrauchs im Einsatz — offline über die Warteschlange.
 *
 * Der `geraetEinsatz`-Eintrag wird lokal geschrieben (`addDocLocal` & Co.)
 * und ist sofort sichtbar; das Abbuchen vom Lager macht die Server Action
 * `syncGeraetVerbrauch`, die ohne Netz scheitert. Sie ist eine
 * „nachholen"-Action (docs/offline-modus.md): offline eingereiht, beim
 * Reconnect ausgeführt.
 *
 * Der Schlüssel je Einsatz und Eintrag hält die Warteschlange klein: Wird die
 * Menge offline dreimal geändert, bleibt *ein* Abgleich — mit der Erwartung
 * der letzten Änderung. Der liest den Eintrag am Server frisch und bucht nur
 * die Differenz zu den bisherigen Buchungen — er ist idempotent, ein
 * doppeltes Ausführen bucht nichts doppelt.
 *
 * `expect` sagt dem Server, welchen Stand des Eintrags der Client geschrieben
 * hat. Ist der noch nicht angekommen, lehnt der Server ab, und der Eintrag
 * bleibt in der Warteschlange, bis Firestore übertragen hat.
 *
 * Aufzurufen nach jedem Anlegen, Ändern oder Löschen eines Eintrags mit
 * `art: 'verbraucht'`.
 */

export const GERAET_VERBRAUCH_QUEUE_TYPE = 'syncGeraetVerbrauch';

export interface GeraetVerbrauchPayload {
  firecallId: string;
  einsatzEintragId: string;
  expect?: VerbrauchExpectation;
}

registerQueueHandler<GeraetVerbrauchPayload>(
  GERAET_VERBRAUCH_QUEUE_TYPE,
  ({ firecallId, einsatzEintragId, expect }) =>
    syncGeraetVerbrauch(firecallId, einsatzEintragId, expect),
);

function queueKey(firecallId: string, einsatzEintragId: string): string {
  return `${GERAET_VERBRAUCH_QUEUE_TYPE}:${firecallId}:${einsatzEintragId}`;
}

function queueOptions(firecallId: string, einsatzEintragId: string): EnqueueOptions {
  return {
    key: queueKey(firecallId, einsatzEintragId),
    label: `Materialverbrauch ${firecallId}/${einsatzEintragId}`,
  };
}

/** Wartet für diesen Eintrag schon ein Abgleich in der Warteschlange? */
export function isGeraetVerbrauchQueued(firecallId: string, einsatzEintragId: string): boolean {
  const key = queueKey(firecallId, einsatzEintragId);
  return getQueueSnapshot().some((entry) => entry.id === key);
}

function payloadOf(
  firecallId: string,
  einsatzEintragId: string,
  expect?: VerbrauchExpectation,
): GeraetVerbrauchPayload {
  return expect ? { firecallId, einsatzEintragId, expect } : { firecallId, einsatzEintragId };
}

/** Online sofort, offline (oder ohne Netz gescheitert) eingereiht. */
export function queueGeraetVerbrauchSync(
  firecallId: string,
  einsatzEintragId: string,
  expect?: VerbrauchExpectation,
): Promise<'done' | 'queued'> {
  return runOrQueue<GeraetVerbrauchPayload>(
    GERAET_VERBRAUCH_QUEUE_TYPE,
    payloadOf(firecallId, einsatzEintragId, expect),
    queueOptions(firecallId, einsatzEintragId),
  );
}

/**
 * Reiht den Abgleich ein, auch wenn der Server erreichbar ist — für einen
 * Aufruf, der online gescheitert ist (Zeitüberschreitung, Konflikt in der
 * Transaktion, noch nicht übertragener Eintrag). Die Warteschlange wiederholt
 * mit wachsendem Abstand und meldet nach `MAX_QUEUE_ATTEMPTS` in der
 * Fehlerliste; der Abgleich ist idempotent.
 */
export async function enqueueGeraetVerbrauchSync(
  firecallId: string,
  einsatzEintragId: string,
  expect?: VerbrauchExpectation,
): Promise<void> {
  await enqueue<GeraetVerbrauchPayload>(
    GERAET_VERBRAUCH_QUEUE_TYPE,
    payloadOf(firecallId, einsatzEintragId, expect),
    queueOptions(firecallId, einsatzEintragId),
  );
  void processQueue();
}
