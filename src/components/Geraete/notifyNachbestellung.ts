import 'server-only';

import {
  FAHRTENBUCH_CONFIG_COLLECTION_ID,
  type FahrtenbuchConfig,
} from '../../common/fahrtenbuch';
import { isValidEmail } from '../../common/kostenersatzEmail';
import type { Group } from '../../app/groups/groupTypes';
import { getBaseUrl } from '../../server/auth/baseUrl';
import { firestore } from '../../server/firebase/admin';
import { mailSender, sendRawMail } from '../../server/mail/sendRawMail';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import {
  buildNachbestellungEmail,
  type NachbestellungItem,
} from './buildNachbestellungEmail';

export type { NachbestellungItem } from './buildNachbestellungEmail';

export interface NotifyNachbestellungArgs {
  groupId: string;
  items: NachbestellungItem[];
  firecallId?: string;
  firecallName?: string;
}

/**
 * Die Mängel-Empfänger der Gruppe (`FahrtenbuchConfig.mangelEmails`), auf
 * brauchbare Adressen eingeschränkt — dieselbe Vorsicht wie in
 * `notifyMangel.ts`: Eine kaputte Adresse darf die Mail an die übrigen nicht
 * verhindern. Auch von der Ablauf-Sammelmail (`sendAblaufReports`) genutzt.
 */
export async function mangelRecipients(groupId: string): Promise<string[]> {
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

/** Der Gruppenname für die Mail — schmückend; ein Lesefehler ergibt `undefined`. */
export async function loadGroupName(groupId: string): Promise<string | undefined> {
  try {
    const doc = await firestore.collection(GROUP_COLLECTION_ID).doc(groupId).get();
    return (doc.data() as Group | undefined)?.name;
  } catch (err) {
    console.warn('Geraete: Gruppenname nicht lesbar', err, { groupId });
    return undefined;
  }
}

/**
 * Meldet Artikel, die unter ihren Mindestbestand gefallen sind.
 *
 * Wirft **nie**: Die Buchung, die das ausgelöst hat, ist zu diesem Zeitpunkt
 * schon geschrieben, und ein Mailfehler darf sie nicht als gescheitert
 * erscheinen lassen — sonst holte die Offline-Warteschlange einen Verbrauch
 * nach, der längst gebucht ist. Fehler werden protokolliert; der Artikel steht
 * über `nachbestellenSeit` ohnehin auf der Liste „Nachzubestellen".
 *
 * `true` heißt: Mail verschickt. `false`: nichts zu melden, keine Empfänger
 * gepflegt oder Versand gescheitert.
 */
export async function notifyNachbestellung({
  groupId,
  items,
  firecallId,
  firecallName,
}: NotifyNachbestellungArgs): Promise<boolean> {
  if (items.length === 0) return false;
  try {
    const [to, ...cc] = await mangelRecipients(groupId);
    if (!to) return false;

    const from = mailSender();
    if (!from) throw new Error('Email service not configured');

    const { raw } = buildNachbestellungEmail({
      items,
      groupId,
      groupName: await loadGroupName(groupId),
      firecallName,
      appBaseUrl: await getBaseUrl(),
      from,
      to,
      cc,
    });
    await sendRawMail(raw);
    return true;
  } catch (err) {
    console.error('notifyNachbestellung failed', err, {
      groupId,
      firecallId,
      geraetIds: items.map((i) => i.geraetId),
    });
    return false;
  }
}
