'use client';

import { doc } from 'firebase/firestore';
import { LatLngPosition } from '../../../../common/geo';
import { setDoc } from '../../../../lib/firestoreClient';
import { firestore } from '../../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  MultiPointItem,
} from '../../../firebase/firestore';
import { calculateDistance, getConnectionPositions } from './distance';
import { MAX_ROUTING_POINTS } from './routedPath';
import {
  itemRoutingProfile,
  itemRoutingSignature,
  routingTodo,
} from './streetRouting';
import { computeStreetRoutedPositions } from './streetRoutingAction';

const clearedRouting = {
  routedPositions: '',
  routedFor: '',
  routingFailed: '',
};

async function routedPositionsFor(
  firecallId: string,
  item: MultiPointItem,
  positions: LatLngPosition[]
): Promise<LatLngPosition[] | undefined> {
  // Die Grenze steht auch in der Action, dort als Schranke gegen alles, was aus
  // dem Browser kommt. Hier ist sie keine zweite Schranke, sondern die Antwort
  // ohne Umweg: Wer die Option an einer Linie mit hunderten Punkten einschaltet
  // — etwa an einer GPS-Aufzeichnung — sieht sofort die Luftlinie mit Hinweis,
  // statt auf eine Ablehnung zu warten, die schon feststeht. Gleiches Muster wie
  // die Größenprüfung der Mangel-Bilder im Browser.
  if (positions.length > MAX_ROUTING_POINTS) {
    console.warn(
      `street routing skipped: ${positions.length} points exceed ${MAX_ROUTING_POINTS}`
    );
    return undefined;
  }

  return computeStreetRoutedPositions(
    firecallId,
    positions,
    itemRoutingProfile(item)
  ).catch((err) => {
    console.error('street routing failed', err);
    return undefined;
  });
}

/**
 * Zieht das Straßen-Routing einer Leitung oder Linie nach: nach dem Zeichnen,
 * nach jeder Änderung an den Punkten und nach dem Umschalten von Option oder
 * Profil.
 *
 * Wirft nicht. Die Änderung am Element ist zu diesem Zeitpunkt schon
 * gespeichert; ein Ausfall des Routings darf sie nicht als Fehler erscheinen
 * lassen. Er hinterlässt stattdessen die Luftlinie und deren Kennzeichnung.
 *
 * Gibt die geschriebenen Felder zurück, damit `ensureConnectionDerived` das
 * Höhenprofil entlang der neuen Geometrie abtasten kann, ohne sie erneut zu
 * lesen.
 */
export async function ensureConnectionRouting(
  firecallId: string,
  item: MultiPointItem
): Promise<Record<string, string | number> | undefined> {
  const todo = routingTodo(item);
  if (todo === 'none' || !item.id) return undefined;

  const positions = getConnectionPositions(item);
  const airlineDistance = Math.round(calculateDistance(positions));

  let update: Record<string, string | number>;
  if (todo === 'clear') {
    update = { ...clearedRouting, distance: airlineDistance };
  } else {
    const routed = await routedPositionsFor(firecallId, item, positions);
    update = routed
      ? {
          routedPositions: JSON.stringify(routed),
          routedFor: itemRoutingSignature(item),
          routingFailed: '',
          distance: Math.round(calculateDistance(routed)),
        }
      : {
          routedPositions: '',
          // Die Signatur wird auch beim Fehlschlag gesetzt: Sie hält fest,
          // wofür das Routing nicht zu bekommen war, und verhindert damit einen
          // Aufruf bei jeder weiteren Änderung.
          routedFor: itemRoutingSignature(item),
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

  return update;
}
