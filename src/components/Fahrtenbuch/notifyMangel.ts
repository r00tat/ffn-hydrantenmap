import 'server-only';

import {
  FAHRTENBUCH_CONFIG_COLLECTION_ID,
  type FahrtenbuchConfig,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { isValidEmail } from '../../common/kostenersatzEmail';
import { firestore } from '../../server/firebase/admin';
import { mailSender, sendRawMail } from '../../server/mail/sendRawMail';
import type { Group } from '../../app/groups/groupTypes';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { buildMangelEmail } from './buildMangelEmail';
import { getBaseUrl } from '../../server/auth/baseUrl';

export interface NotifyMangelArgs {
  groupId: string;
  entry: FahrtenbuchEntry;
  vehicle: Pick<FahrtenbuchVehicle, 'name' | 'kennzeichen' | 'counters'>;
}

/**
 * Die gepflegten Empfänger der Gruppe, auf brauchbare Adressen eingeschränkt.
 *
 * Die Validierung steht schon in der Speicher-Action; hier noch einmal, weil
 * gespeicherte Daten älter sein können als die Regel, die sie heute
 * durchlässt. Eine kaputte Adresse in der Liste darf nicht dazu führen, dass
 * die Gmail-API die ganze Nachricht ablehnt und auch die gültigen Empfänger
 * nichts erfahren.
 */
async function recipients(groupId: string): Promise<string[]> {
  const doc = await firestore
    .collection(FAHRTENBUCH_CONFIG_COLLECTION_ID)
    .doc(groupId)
    .get();
  if (!doc.exists) return [];
  const stored = (doc.data() as FahrtenbuchConfig | undefined)?.mangelEmails;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => isValidEmail(value));
}

/**
 * Der Name der Gruppe für die Mail — schmückendes Beiwerk, kein Pflichtteil.
 * Ein Fehler beim Lesen darf die Benachrichtigung nicht verhindern: Der
 * eigentliche Inhalt steht am Eintrag und am Fahrzeug.
 */
async function groupName(groupId: string): Promise<string | undefined> {
  try {
    const doc = await firestore.collection(GROUP_COLLECTION_ID).doc(groupId).get();
    return (doc.data() as Group | undefined)?.name;
  } catch (err) {
    console.warn('notifyMangel: Gruppenname nicht lesbar', err, { groupId });
    return undefined;
  }
}

/**
 * Benachrichtigt die Gruppe über einen gemeldeten Mangel.
 *
 * `false` heißt „nichts zu tun" — die Gruppe hat keine Empfänger gepflegt, das
 * ist die vorgesehene Abschaltung und kein Fehler. Geworfen wird nur, wenn
 * Empfänger gepflegt sind, die Mail aber nicht rausgeht; die Aufrufer
 * protokollieren das und melden die Fahrt weiterhin als gespeichert.
 */
export async function notifyMangel({
  groupId,
  entry,
  vehicle,
}: NotifyMangelArgs): Promise<boolean> {
  const [to, ...cc] = await recipients(groupId);
  if (!to) return false;

  const from = mailSender();
  if (!from) {
    throw new Error('Email service not configured');
  }

  const { raw } = buildMangelEmail({
    entry,
    vehicle,
    groupId,
    groupName: await groupName(groupId),
    appBaseUrl: await getBaseUrl(),
    from,
    to,
    cc,
  });
  await sendRawMail(raw);
  return true;
}
