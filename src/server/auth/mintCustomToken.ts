import 'server-only';

import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { FirebaseUserInfo } from '../../common/users';
import { guestCanWrite, isFirecallGuest } from '../../common/firecallGuest';
import { shareLinkStatus } from '../../common/firecallShareLink';
import { firebaseAuth, firestore } from '../firebase/admin';

export interface MintedCustomToken {
  token?: string;
  error?: string;
}

/**
 * Baut ein Firebase Custom Token fuer einen Benutzer.
 *
 * Die Claims kommen aus dem **Benutzerdokument**, nie vom Aufrufer: Wer das
 * Token anfordert, belegt damit nur seine Identitaet, nicht seine Rechte.
 * Damit wirkt ein Entzug in Firestore sofort, egal ueber welchen Weg das
 * Token angefordert wird.
 *
 * Gemeinsame Grundlage des Share-Link-Tausches (`exchangeCustomJwtForFirebaseToken`)
 * und der Wiederanmeldung aus einer bestehenden NextAuth-Session
 * (`createFirebaseTokenForSession`) — beide muessen dieselben Claims praegen,
 * sonst unterscheiden sich die Firestore-Rechte je nach Anmeldeweg.
 */
export async function mintFirebaseCustomToken(
  uid: string,
): Promise<MintedCustomToken> {
  const userDoc = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(uid)
    .get();

  if (!userDoc.exists) {
    return { error: `no user document for ${uid}` };
  }

  const userData = userDoc.data() as FirebaseUserInfo;
  if (!userData.authorized) {
    return { error: `user ${uid} is not authorized` };
  }

  // Ablauf und Entzug wirken ueber das Benutzerdokument, nicht ueber das
  // Token. Ein Gast ohne Ablaufdatum stammt aus der Zeit vor der
  // Link-Verwaltung und gilt damit als abgelaufen.
  if (
    isFirecallGuest(userData) &&
    shareLinkStatus(
      {
        expiresAt: userData.firecallExpiresAt,
        disabled: !userData.authorized,
      },
      Date.now(),
    ) !== 'active'
  ) {
    return { error: 'Token expired' };
  }

  const firecall = userData.firecall;
  const token = await firebaseAuth.createCustomToken(uid, {
    groups: userData.groups || ['allUsers'],
    isAdmin: !!userData.isAdmin,
    authorized: true,
    // `undefined` ist als Developer Claim nicht erlaubt — die Einsatz-Claims
    // entfallen daher komplett, wenn der Benutzer kein Einsatz-Gast ist.
    ...(firecall
      ? {
          firecall,
          firecallWrite: guestCanWrite(userData),
          // Die Firestore-Rules pruefen den Ablauf gegen `request.time`.
          ...(userData.firecallExpiresAt
            ? { firecallExpires: userData.firecallExpiresAt }
            : {}),
        }
      : {}),
  });

  return { token };
}
