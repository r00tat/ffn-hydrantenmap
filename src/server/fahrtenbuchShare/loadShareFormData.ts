import 'server-only';

import {
  FAHRTENBUCH_PERSON_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  toShareLinkPerson,
  toShareLinkVehicle,
  type ShareLinkFormData,
} from '../../common/fahrtenbuchShare';
import { GROUP_COLLECTION_ID } from '../../components/firebase/firestore';
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

  const [groupDoc, vehicleSnapshot, personSnapshot] = await Promise.all([
    groupRef.get(),
    groupRef.collection(FAHRTENBUCH_VEHICLE_COLLECTION_ID).get(),
    groupRef.collection(FAHRTENBUCH_PERSON_COLLECTION_ID).get(),
  ]);

  const vehicles = vehicleSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchVehicle)
    // `active !== false` wie überall sonst im Projekt: ein Dokument ohne das
    // Feld gilt als aktiv. Mit `vehicle.active` wäre es in der App sichtbar,
    // auf der Gastseite aber nicht — und dem Gast fiele es nie auf.
    .filter((vehicle) => vehicle.active !== false)
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    )
    .map(toShareLinkVehicle);

  const persons = personSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as FahrtenbuchPerson)
    .filter((person) => person.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toShareLinkPerson);

  return {
    // Kein Rückfall auf `groupId`: das wäre eine interne Firestore-Dokument-ID
    // auf einer anmeldefreien Seite. Fehlt das Gruppendokument, zeigt die
    // Gastseite den Untertitel einfach nicht an.
    groupName: (groupDoc.data()?.name as string) ?? '',
    vehicles,
    persons,
  };
}
