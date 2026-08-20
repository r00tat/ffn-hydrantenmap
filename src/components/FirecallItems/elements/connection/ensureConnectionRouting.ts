'use client';

import { doc } from 'firebase/firestore';
import { setDoc } from '../../../../lib/firestoreClient';
import { firestore } from '../../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  MultiPointItem,
} from '../../../firebase/firestore';
import { calculateDistance, getConnectionPositions } from './distance';
import { positionsSignature } from './routedPath';
import { routingTodo } from './streetRouting';
import { computeStreetRoutedPositions } from './streetRoutingAction';

const clearedRouting = {
  routedPositions: '',
  routedFor: '',
  routingFailed: '',
};

/**
 * Zieht das Straßen-Routing einer Leitung nach: nach dem Zeichnen, nach jeder
 * Änderung an den Punkten und nach dem Umschalten der Option.
 *
 * Wirft nicht. Die Änderung an der Leitung ist zu diesem Zeitpunkt schon
 * gespeichert; ein Ausfall des Routings darf sie nicht als Fehler erscheinen
 * lassen. Er hinterlässt stattdessen die Luftlinie und deren Kennzeichnung.
 */
export async function ensureConnectionRouting(
  firecallId: string,
  item: MultiPointItem
): Promise<void> {
  const todo = routingTodo(item);
  if (todo === 'none' || !item.id) return;

  const positions = getConnectionPositions(item);
  const airlineDistance = Math.round(calculateDistance(positions));

  let update: Record<string, string | number>;
  if (todo === 'clear') {
    update = { ...clearedRouting, distance: airlineDistance };
  } else {
    const routed = await computeStreetRoutedPositions(
      firecallId,
      positions
    ).catch((err) => {
      console.error('street routing failed', err);
      return undefined;
    });
    update = routed
      ? {
          routedPositions: JSON.stringify(routed),
          routedFor: positionsSignature(positions),
          routingFailed: '',
          distance: Math.round(calculateDistance(routed)),
        }
      : {
          routedPositions: '',
          // Die Signatur wird auch beim Fehlschlag gesetzt: Sie hält fest, für
          // welche Punkte das Routing nicht zu bekommen war, und verhindert
          // damit einen Aufruf bei jeder weiteren Änderung.
          routedFor: positionsSignature(positions),
          routingFailed: 'true',
          distance: airlineDistance,
        };
  }

  await setDoc(
    doc(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      FIRECALL_ITEMS_COLLECTION_ID,
      item.id
    ),
    update,
    { merge: true }
  ).catch((err) => console.error('unable to save street routing', err));
}
