import 'server-only';

import {
  ATEMSCHUTZ_GERAET_COLLECTION_ID,
  type AtemschutzGeraet,
} from '../../common/atemschutz';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';

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
