'use server';

import { actionUserAuthorizedForFirecall } from '../../app/auth';
import {
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  type AtemschutzTrupp,
} from '../../common/atemschutz';
import {
  planeUeberwachungTask,
  type TaskStatus,
} from '../../server/atemschutz/ueberwachungTasks';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';

/**
 * Plant den Termin für die nächste Warnung eines Trupps.
 *
 * Wird vom Client **nach** dem Schreibvorgang aufgerufen, der die Fristen
 * verändert: Abmarsch, Druckabfrage, Übernahme mit anderem Gerätesatz. Der
 * Client schreibt direkt in Firestore (Client-SDK), es gibt also keinen
 * Serverpunkt, der das von selbst mitbekäme — ein Firestore-Trigger wäre eine
 * zweite Laufzeitumgebung für drei Zeilen Rechnung.
 *
 * Der Trupp wird hier **serverseitig gelesen** und nicht vom Client
 * mitgeschickt: Aus seinen Zeiten und Drücken entsteht der Termin einer
 * Sicherheitswarnung, und der Aufrufer soll ihn nicht bestimmen können.
 *
 * Scheitert die Planung, ist das kein Fehler des Schreibvorgangs — der Lauf
 * findet den Trupp auch über den Zeitplan als Netz, und die geöffnete Seite
 * warnt ohnehin selbst.
 */
export async function planeUeberwachungWarnung(
  firecallId: string,
  truppId: string,
): Promise<TaskStatus> {
  await actionUserAuthorizedForFirecall(firecallId, { requireWrite: true });

  // Eine ID mit Schrägstrich zeigte auf ein anderes Dokument, `.` und `..`
  // ließen das SDK werfen — dieselbe Vorsicht wie bei `ueberwachungUids`.
  const id = truppId?.trim();
  if (!id || id.includes('/') || id === '.' || id === '..') {
    return 'nothingDue';
  }

  const snap = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(ATEMSCHUTZ_TRUPP_COLLECTION_ID)
    .doc(id)
    .get();
  if (!snap.exists) return 'nothingDue';

  const { status } = await planeUeberwachungTask({
    firecallId,
    trupp: { ...(snap.data() as AtemschutzTrupp), id: snap.id },
  });
  return status;
}
