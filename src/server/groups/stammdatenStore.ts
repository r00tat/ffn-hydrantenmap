import 'server-only';

import {
  DEFAULT_GROUP_STAMMDATEN,
  GROUP_CONFIG_COLLECTION_ID,
  GROUP_STAMMDATEN_DOC,
  logoFormatOf,
  type GroupStammdaten,
  type PdfLogo,
} from '../../common/groupStammdaten';
import { GROUP_COLLECTION_ID } from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';
import { getDefaultStorageBucket } from '../firebase/storageBucket';

/**
 * Der Storage- und Firestore-Zugriff auf die Stammdaten — getrennt von
 * `stammdatenActions.ts`, weil aus einer `'use server'`-Datei nur exportiert
 * werden darf, was eine Action sein soll. Dieselbe Trennung wie bei
 * `mangelImageStore.ts`.
 */

/** Wie lange eine signierte Logo-URL gilt. */
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

export function stammdatenRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(GROUP_CONFIG_COLLECTION_ID)
    .doc(GROUP_STAMMDATEN_DOC);
}

export async function loadGroupStammdaten(groupId: string): Promise<GroupStammdaten> {
  const doc = await stammdatenRef(groupId).get();
  if (!doc.exists) return { ...DEFAULT_GROUP_STAMMDATEN };
  return { ...DEFAULT_GROUP_STAMMDATEN, ...doc.data() };
}

/** Der `feuerwehrName` aus dem Gruppendokument — Rückfall für den Absender. */
export async function loadGroupFeuerwehrName(groupId: string): Promise<string> {
  const doc = await firestore.collection(GROUP_COLLECTION_ID).doc(groupId).get();
  return (doc.data()?.feuerwehrName as string | undefined)?.trim() ?? '';
}

/**
 * Das Logo der Gruppe als Bytes, oder `undefined`.
 *
 * Wirft nicht: Anders als die Bankverbindung ist das Logo kein Grund, einen
 * Beleg zu verweigern. Ein PDF ohne Kopfbild ist brauchbar, ein fehlendes
 * PDF nicht.
 */
export async function loadStammdatenLogo(
  stammdaten: GroupStammdaten,
): Promise<PdfLogo | undefined> {
  if (!stammdaten.logoPath) return undefined;
  try {
    const bucket = await getDefaultStorageBucket();
    const file = bucket.file(stammdaten.logoPath);
    const [metadata] = await file.getMetadata();
    const format = logoFormatOf(metadata.contentType ?? undefined);
    if (!format) return undefined;
    const [data] = await file.download();
    return { data, format };
  } catch (err) {
    console.error('loadStammdatenLogo failed', err, stammdaten.logoPath);
    return undefined;
  }
}

/** Kurzlebige Lese-URL — die Storage-Regel sperrt das Lesen bewusst. */
export async function signStammdatenLogoUrl(logoPath: string): Promise<string> {
  const bucket = await getDefaultStorageBucket();
  const [url] = await bucket.file(logoPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return url;
}

/**
 * Löscht eine Logodatei. Ein fehlendes Objekt ist kein Fehler und ein
 * Fehlschlag wird nur protokolliert: Eine verwaiste Datei im Storage ist ein
 * kleineres Übel als ein Logo, das sich nicht austauschen lässt.
 */
export async function deleteStammdatenLogo(logoPath: string): Promise<void> {
  try {
    const bucket = await getDefaultStorageBucket();
    await bucket.file(logoPath).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error('deleteStammdatenLogo: Datei nicht gelöscht', err, logoPath);
  }
}
