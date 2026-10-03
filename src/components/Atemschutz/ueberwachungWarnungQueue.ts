'use client';

import { registerQueueHandler, runOrQueue } from '../../lib/offlineQueue';
import { planeUeberwachungWarnung } from './ueberwachungTaskAction';

/**
 * Terminplanung der Atemschutzwarnung — offline über die Warteschlange.
 *
 * `planeUeberwachungWarnung` ist eine Server Action und scheitert ohne Netz.
 * Offline wird der Aufruf deshalb in `offlineQueue.ts` eingereiht und beim
 * Reconnect nachgeholt. Der Schlüssel je Einsatz und Trupp hält die
 * Warteschlange klein: Fünf Druckabfragen offline ergeben *eine* Planung, und
 * die liest den Trupp ohnehin frisch am Server — die Planung ist idempotent.
 */

export const PLAN_WARNING_QUEUE_TYPE = 'planeUeberwachungWarnung';

interface PlanWarningPayload {
  firecallId: string;
  truppId: string;
}

registerQueueHandler<PlanWarningPayload>(
  PLAN_WARNING_QUEUE_TYPE,
  ({ firecallId, truppId }) => planeUeberwachungWarnung(firecallId, truppId),
);

export function planWarningOrQueue(
  firecallId: string,
  truppId: string,
): Promise<'done' | 'queued'> {
  return runOrQueue<PlanWarningPayload>(
    PLAN_WARNING_QUEUE_TYPE,
    { firecallId, truppId },
    {
      key: `${PLAN_WARNING_QUEUE_TYPE}:${firecallId}:${truppId}`,
      label: `Atemschutzwarnung ${firecallId}/${truppId}`,
    },
  );
}
