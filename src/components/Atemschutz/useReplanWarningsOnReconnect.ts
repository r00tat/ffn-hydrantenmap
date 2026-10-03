'use client';

import { useEffect, useRef } from 'react';
import { onReconnect } from '../../lib/connectivity';
import { waitForFirestoreSync } from '../../lib/firestoreSync';
import { planWarningOrQueue } from './ueberwachungWarnungQueue';

/**
 * Plant beim Reconnect die Serverwarnung für **alle** Trupps im Einsatz neu.
 *
 * Was offline geschrieben wurde, steht schon in der Warteschlange
 * (`planWarningOrQueue` je Schreibvorgang) und wird von ihr nachgeholt. Das
 * deckt aber nur ab, was *dieses* Gerät geändert hat: Ein Trupp, der vor dem
 * Funkloch abmarschiert ist und dessen Aufgabe in Cloud Tasks nie entstand,
 * oder einer, den ein anderes Gerät angelegt hat, bliebe bis zum Netz-Zeitplan
 * (zehn Minuten) ohne Termin. Die Planung ist idempotent (Aufgabenname als
 * Dublettensperre) — ein Aufruf zu viel kostet nichts.
 *
 * Vor der Planung wird auf die Übertragung der offline geschriebenen
 * Firestore-Änderungen gewartet (mit Zeitgrenze): Die Action liest den Trupp
 * per Admin SDK und sähe sonst den alten Stand oder gar keinen Trupp.
 *
 * Über `planWarningOrQueue`: Reißt die Verbindung gleich wieder ab, landet der
 * Aufruf in der Warteschlange statt verloren zu gehen.
 */
export default function useReplanWarningsOnReconnect(
  firecallId: string | undefined,
  truppIds: readonly string[],
): void {
  // Die Liste ändert sich mit jedem Snapshot; neu abonniert wird deshalb nur
  // beim Wechsel des Einsatzes.
  const idsRef = useRef(truppIds);
  useEffect(() => {
    idsRef.current = truppIds;
  }, [truppIds]);

  useEffect(() => {
    if (!firecallId) return;
    let active = true;
    const unsubscribe = onReconnect(() => {
      void waitForFirestoreSync().then(() => {
        if (!active) return;
        for (const truppId of idsRef.current) {
          void planWarningOrQueue(firecallId, truppId).catch((err) => {
            console.warn(
              'Terminplanung der Atemschutzwarnung nach dem Reconnect fehlgeschlagen',
              err,
            );
          });
        }
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [firecallId]);
}
