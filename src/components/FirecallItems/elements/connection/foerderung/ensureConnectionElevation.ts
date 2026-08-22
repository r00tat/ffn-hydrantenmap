'use client';

import { doc } from 'firebase/firestore';
import { setDoc } from '../../../../../lib/firestoreClient';
import { firestore } from '../../../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  type MultiPointItem,
} from '../../../../firebase/firestore';
import { fetchElevations } from './elevationAction';
import {
  elevationSignature,
  elevationTodo,
  foerderungSamples,
  isFoerderungEnabled,
} from './elevationProfile';

const clearedElevation = {
  elevationProfile: '',
  elevationFor: '',
  elevationFailed: '',
};

/**
 * Zieht das Höhenprofil einer Leitung nach: nach dem Zeichnen, nach jeder
 * Änderung an den Punkten, nach einem neuen Straßenverlauf und nach dem
 * Einschalten des Rechners.
 *
 * Wirft nicht. Die Änderung am Element ist zu diesem Zeitpunkt schon
 * gespeichert; ein Ausfall der Höhenabfrage darf sie nicht als Fehler
 * erscheinen lassen. Er hinterlässt stattdessen `elevationFailed`, und der
 * Dialog rechnet mit dem eingegebenen Höhenunterschied.
 *
 * Gibt die geschriebenen Felder zurück, damit ein Aufrufer weiterarbeiten kann,
 * ohne erneut zu lesen.
 */
export async function ensureConnectionElevation(
  firecallId: string,
  item: MultiPointItem,
  /**
   * `force`: auch dann abfragen, wenn für diese Abtastung schon ein Fehlschlag
   * vermerkt ist. Das ist der Knopf „erneut versuchen" im Rechner — ohne ihn
   * bliebe eine Leitung nach einem einzigen Aussetzer des Höhendienstes für
   * immer bei der Handeingabe, denn genau das verhindert der Vermerk sonst
   * absichtlich.
   */
  { force = false }: { force?: boolean } = {}
): Promise<Record<string, string> | undefined> {
  const todo = elevationTodo(item);
  if (!item.id) return undefined;
  if (todo === 'none' && !(force && isFoerderungEnabled(item))) {
    return undefined;
  }

  let update: Record<string, string>;
  if (todo === 'clear') {
    update = { ...clearedElevation };
  } else {
    const samples = foerderungSamples(item);
    const elevations = await fetchElevations(
      firecallId,
      samples.map(({ position }) => position)
    ).catch((err) => {
      console.error('elevation lookup failed', err);
      return undefined;
    });

    update = elevations
      ? {
          elevationProfile: JSON.stringify(elevations),
          elevationFor: elevationSignature(samples),
          elevationFailed: '',
        }
      : {
          elevationProfile: '',
          // Die Signatur wird auch beim Fehlschlag gesetzt: Sie hält fest, wofür
          // die Höhen nicht zu bekommen waren, und verhindert damit eine neue
          // Abfrage bei jeder weiteren Änderung.
          elevationFor: elevationSignature(samples),
          elevationFailed: 'true',
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
  ).catch((err) => console.error('unable to save elevation profile', err));

  return update;
}
