import 'server-only';

import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import {
  ATEMSCHUTZ_GERAET_COLLECTION_ID,
  type AtemschutzFuellung,
  type AtemschutzGeraet,
} from '../../common/atemschutz';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { foreignDeviceRefs } from './fuellungErfassung';

/**
 * Der Firestore-Zugriff auf die Atemschutz-Stammdaten — bewusst getrennt von
 * `atemschutzActions.ts`: Aus einer `'use server'`-Datei darf nur exportiert
 * werden, was eine Action sein soll (jeder Export wird dort zu einem
 * aufrufbaren Endpunkt). Dieselbe Trennung wie bei `mangelStore.ts`.
 */

export function geraeteRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(ATEMSCHUTZ_GERAET_COLLECTION_ID);
}

export async function loadGeraete(
  groupId: string,
): Promise<AtemschutzGeraet[]> {
  const snapshot = await geraeteRef(groupId).get();
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as AtemschutzGeraet,
  );
}

export async function loadGeraet(
  groupId: string,
  geraetId: string,
): Promise<AtemschutzGeraet> {
  const doc = await geraeteRef(groupId).doc(geraetId).get();
  if (!doc.exists) {
    throw new Error(
      `atemschutzGeraet ${geraetId} not found in group ${groupId}`,
    );
  }
  return { id: doc.id, ...doc.data() } as AtemschutzGeraet;
}

type GetAll = (...refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;

/**
 * Die Flaschen anderer Gruppen, auf die Füllungen von `groupId` zeigen
 * (`geraetGroupId`), gezielt per Pfad gelesen — ohne den ganzen Bestand der
 * anderen Gruppe zu laden. Ergänzt `loadGeraete(groupId)` für Export und
 * Rechnung; eine nicht mehr vorhandene Flasche fehlt einfach.
 *
 * Gelesen wird mit dem Admin SDK, also auch aus einer Gruppe, in der der
 * Aufrufer kein Mitglied ist. Das ist vertretbar: Der Verweis steht an einer
 * Füllung seiner Gruppe, verwendet werden nur Kennung und Volumen, und eine
 * Auto-ID ist nicht zu erraten.
 *
 * `getAll` ist austauschbar, damit die Rechnung in ihrer Transaktion liest.
 */
export async function loadForeignGeraete(
  groupId: string,
  fuellungen: ReadonlyArray<Pick<AtemschutzFuellung, 'geraetId' | 'geraetGroupId'>>,
  getAll: GetAll = (...refs) => firestore.getAll(...refs),
): Promise<AtemschutzGeraet[]> {
  const refs = foreignDeviceRefs(groupId, fuellungen);
  if (refs.length === 0) return [];
  const docs = await getAll(
    ...refs.map((r) => geraeteRef(r.groupId).doc(r.geraetId)),
  );
  return docs.flatMap((d, index) =>
    d.exists
      ? [{ id: d.id, groupId: refs[index].groupId, ...d.data() } as AtemschutzGeraet]
      : [],
  );
}
