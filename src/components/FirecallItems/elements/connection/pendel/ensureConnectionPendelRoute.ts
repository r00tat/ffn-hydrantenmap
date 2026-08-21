'use client';

import { doc } from 'firebase/firestore';
import { setDoc } from '../../../../../lib/firestoreClient';
import { firestore } from '../../../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  MultiPointItem,
} from '../../../../firebase/firestore';
import { computeStreetRoutedPositions } from '../streetRoutingAction';
import {
  pendelEndpoints,
  pendelRoutingSignature,
  pendelRoutingTodo,
} from './pendelRoute';

/**
 * Zieht die Fahrtroute des Pendelverkehrs nach.
 *
 * Wirft nicht. Die Änderung am Element ist zu diesem Zeitpunkt schon
 * gespeichert; ein Ausfall des Routings darf sie nicht als Fehler erscheinen
 * lassen. Er hinterlässt stattdessen die Kennzeichnung, und der Rechner
 * arbeitet mit der Luftlinie und dem Umwegfaktor weiter.
 *
 * Es braucht keine eigene Server-Action: `computeStreetRoutedPositions` nimmt
 * das Profil als Parameter, und `drive` ist genau das, was eine Fahrt braucht —
 * Fußwege sind kein Weg, und die Fahrtrichtung zählt.
 */
export async function ensureConnectionPendelRoute(
  firecallId: string,
  item: MultiPointItem
): Promise<Record<string, string> | undefined> {
  const todo = pendelRoutingTodo(item);
  if (todo === 'none' || !item.id) return undefined;

  let update: Record<string, string>;
  if (todo === 'clear') {
    update = {
      pendelRoutedPositions: '',
      pendelRoutedFor: '',
      pendelRoutingFailed: '',
    };
  } else {
    const endpoints = pendelEndpoints(item);
    const routed = endpoints
      ? await computeStreetRoutedPositions(firecallId, endpoints, 'drive').catch(
          (err) => {
            console.error('pendel routing failed', err);
            return undefined;
          }
        )
      : undefined;

    update = routed
      ? {
          pendelRoutedPositions: JSON.stringify(routed),
          pendelRoutedFor: pendelRoutingSignature(item),
          pendelRoutingFailed: '',
        }
      : {
          pendelRoutedPositions: '',
          // Die Signatur wird auch beim Fehlschlag gesetzt: Sie hält fest,
          // wofür das Routing nicht zu bekommen war, und verhindert einen
          // Aufruf bei jeder weiteren Änderung.
          pendelRoutedFor: pendelRoutingSignature(item),
          pendelRoutingFailed: 'true',
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
  ).catch((err) => console.error('unable to save pendel route', err));

  return update;
}
