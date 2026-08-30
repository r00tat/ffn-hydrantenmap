import 'server-only';

import {
  compareVehicles,
  FAHRTENBUCH_PERSON_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  SHARE_LINK_FIRECALL_LIMIT,
  toShareLinkFirecall,
  toShareLinkPerson,
  toShareLinkVehicle,
  type ShareLinkFormData,
} from '../../common/fahrtenbuchShare';
import {
  FIRECALL_COLLECTION_ID,
  GROUP_COLLECTION_ID,
  type Firecall,
} from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';

/**
 * Stammdaten für die Gastseite. Was hier nicht durch `toShareLink*` läuft,
 * verlässt den Server nicht — die Rohdokumente enthalten Kontaktdaten der
 * Mitglieder und Audit-Felder.
 */
export async function loadShareFormData(
  groupId: string,
): Promise<ShareLinkFormData> {
  const groupRef = firestore.collection(GROUP_COLLECTION_ID).doc(groupId);

  const [groupDoc, vehicleSnapshot, personSnapshot, firecallSnapshot] =
    await Promise.all([
      groupRef.get(),
      groupRef.collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID).get(),
      groupRef.collection(FAHRTENBUCH_PERSON_COLLECTION_ID).get(),
      // Dieselbe Abfrage wie die Einsatzliste der angemeldeten Seite, nur
      // kürzer — sie wird vom Index `deleted ASC, group ASC, date DESC`
      // bedient.
      firestore
        .collection(FIRECALL_COLLECTION_ID)
        .where('deleted', '==', false)
        .where('group', '==', groupId)
        .orderBy('date', 'desc')
        .limit(SHARE_LINK_FIRECALL_LIMIT)
        .get(),
    ]);

  const vehicles = vehicleSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchVehicle)
    // `active !== false` wie überall sonst im Projekt: ein Dokument ohne das
    // Feld gilt als aktiv. Mit `vehicle.active` wäre es in der App sichtbar,
    // auf der Gastseite aber nicht — und dem Gast fiele es nie auf.
    .filter((vehicle) => vehicle.active !== false)
    // Dieselbe Ordnung wie in der App: Kategorie, darin alphabetisch.
    .sort(compareVehicles)
    .map(toShareLinkVehicle);

  const persons = personSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchPerson)
    .filter((person) => person.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toShareLinkPerson);

  const firecalls = firecallSnapshot.docs.map((doc) =>
    toShareLinkFirecall({ id: doc.id, ...(doc.data() as Firecall) }),
  );

  return {
    // Kein Rückfall auf `groupId`: das wäre eine interne Firestore-Dokument-ID
    // auf einer anmeldefreien Seite. Fehlt das Gruppendokument, zeigt die
    // Gastseite den Untertitel einfach nicht an.
    groupName: (groupDoc.data()?.name as string) ?? '',
    vehicles,
    persons,
    firecalls,
  };
}
