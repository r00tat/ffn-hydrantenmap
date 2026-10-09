'use client';

import {
  enqueue,
  getQueueSnapshot,
  processQueue,
  registerQueueHandler,
  runOrQueue,
  type EnqueueOptions,
} from '../../lib/offlineQueue';
import { syncGeraetZuordnung } from './geraeteActions';

/**
 * Protokoll der Zuordnung eines Geräts im Einsatz — offline über die
 * Warteschlange.
 *
 * Der `geraetEinsatz`-Eintrag wird lokal geschrieben; den Eintrag in der
 * Historie des Artikels schreibt die Server Action `syncGeraetZuordnung`, die
 * ohne Netz scheitert. Sie ist eine „nachholen"-Action (docs/offline-modus.md):
 * offline eingereiht, beim Reconnect ausgeführt.
 *
 * Der Schlüssel je Einsatz und Eintrag hält die Warteschlange klein: Anlegen
 * und Löschen desselben Eintrags offline ergibt *einen* Abgleich. Der liest
 * den Eintrag am Server frisch und schreibt nur, was im Protokoll fehlt — er
 * ist idempotent und braucht keine Erwartung.
 *
 * Aufzurufen nach jedem Anlegen und Löschen eines Eintrags mit
 * `art: 'zugeordnet'`.
 */

export const GERAET_ZUORDNUNG_QUEUE_TYPE = 'syncGeraetZuordnung';

export interface GeraetZuordnungPayload {
  firecallId: string;
  einsatzEintragId: string;
}

registerQueueHandler<GeraetZuordnungPayload>(
  GERAET_ZUORDNUNG_QUEUE_TYPE,
  ({ firecallId, einsatzEintragId }) => syncGeraetZuordnung(firecallId, einsatzEintragId),
);

function queueKey(firecallId: string, einsatzEintragId: string): string {
  return `${GERAET_ZUORDNUNG_QUEUE_TYPE}:${firecallId}:${einsatzEintragId}`;
}

function queueOptions(firecallId: string, einsatzEintragId: string): EnqueueOptions {
  return {
    key: queueKey(firecallId, einsatzEintragId),
    label: `Gerätezuordnung ${firecallId}/${einsatzEintragId}`,
  };
}

/** Wartet für diesen Eintrag schon ein Abgleich in der Warteschlange? */
export function isGeraetZuordnungQueued(firecallId: string, einsatzEintragId: string): boolean {
  const key = queueKey(firecallId, einsatzEintragId);
  return getQueueSnapshot().some((entry) => entry.id === key);
}

/** Online sofort, offline (oder ohne Netz gescheitert) eingereiht. */
export function queueGeraetZuordnungSync(
  firecallId: string,
  einsatzEintragId: string,
): Promise<'done' | 'queued'> {
  return runOrQueue<GeraetZuordnungPayload>(
    GERAET_ZUORDNUNG_QUEUE_TYPE,
    { firecallId, einsatzEintragId },
    queueOptions(firecallId, einsatzEintragId),
  );
}

/**
 * Reiht den Abgleich ein, auch wenn der Server erreichbar ist — für einen
 * Aufruf, der online gescheitert ist. Die Warteschlange wiederholt mit
 * wachsendem Abstand; der Abgleich ist idempotent.
 */
export async function enqueueGeraetZuordnungSync(
  firecallId: string,
  einsatzEintragId: string,
): Promise<void> {
  await enqueue<GeraetZuordnungPayload>(
    GERAET_ZUORDNUNG_QUEUE_TYPE,
    { firecallId, einsatzEintragId },
    queueOptions(firecallId, einsatzEintragId),
  );
  void processQueue();
}
