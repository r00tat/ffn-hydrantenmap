import 'server-only';

import { ApiException } from '../../app/api/errors';
import {
  FAHRTENBUCH_SHARE_LINK_COLLECTION_ID,
  type FahrtenbuchShareLink,
} from '../../common/fahrtenbuchShare';
import { assertFahrtenbuchGroup } from '../../components/Fahrtenbuch/authGuards';
import { firestore } from '../firebase/admin';

export interface ResolvedShareLink {
  token: string;
  groupId: string;
  /**
   * Nicht geheime Kennung des Links. Nur sie darf in Feldern landen, die jedes
   * Gruppenmitglied lesen kann — der Token ist das Geheimnis des Links.
   */
  linkId: string;
}

/**
 * Alle Fehlschläge tragen dieselbe Meldung und denselben Status. Wer einen
 * Link ausprobiert, darf nicht erkennen können, ob er nie existierte, ob er
 * widerrufen wurde oder ob er auf eine unzulässige Gruppe zeigte.
 */
const invalid = () => new ApiException('share link invalid', { status: 404 });

/**
 * Löst einen Fahrtenbuch-Share-Token in seine Gruppe auf. Das Gegenstück zu
 * `actionGroupMemberRequired()` für den anmeldefreien Pfad.
 *
 * Beide Aufrufer — die öffentliche Seite und die Schreib-Action — fangen die
 * Ausnahme ab; sie darf nie bis zur Next-Fehlerseite durchschlagen.
 */
export async function resolveFahrtenbuchShareLink(
  token: string,
): Promise<ResolvedShareLink> {
  if (!token?.trim()) throw invalid();

  try {
    const doc = await firestore
      .collection(FAHRTENBUCH_SHARE_LINK_COLLECTION_ID)
      .doc(token)
      .get();
    if (!doc.exists) throw invalid();

    const data = doc.data() as FahrtenbuchShareLink | undefined;
    // Eine fehlende `linkId` ist wie eine fehlende `groupId` ein fehlerhaftes
    // Dokument: ohne sie gäbe es keine nicht geheime Kennung für `createdBy`,
    // und ersatzweise den Token einzutragen ist genau das, was hier verhindert
    // werden soll. Bestandsdaten gibt es noch keine.
    if (!data?.groupId || !data.linkId || data.revokedAt) throw invalid();

    try {
      // Dieselbe Mandanten-Sperre wie im angemeldeten Pfad: ein Link auf
      // `allUsers` oder `kostenersatz` darf auch dann nicht funktionieren, wenn
      // er auf irgendeinem Weg angelegt wurde.
      assertFahrtenbuchGroup(data.groupId);
    } catch {
      // Die Originalmeldung nennt die Gruppe und würde diesen Fall von einem
      // widerrufenen Link unterscheidbar machen.
      throw invalid();
    }

    return { token, groupId: data.groupId, linkId: data.linkId };
  } catch (err) {
    if (err instanceof ApiException) throw err;
    // Ein ungültiger Dokumentpfad (etwa ein Token mit Schrägstrich) oder ein
    // Firestore-Ausfall darf nach außen nicht von einem unbekannten Token zu
    // unterscheiden sein — die Originalmeldung ginge sonst an einen anonymen
    // Aufrufer.
    console.error('resolveFahrtenbuchShareLink failed', err);
    throw invalid();
  }
}

export default resolveFahrtenbuchShareLink;
