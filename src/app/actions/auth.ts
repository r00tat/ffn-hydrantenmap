'use server';
import 'server-only';

import { firebaseAuth, firestore } from '../../server/firebase/admin';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { CustomClaims } from '../api/users/[uid]/updateUser';
import { verifyJwt } from './jwt';
import { FirebaseUserInfo } from '../../common/users';
import { guestCanWrite, isFirecallGuest } from '../../common/firecallGuest';
import { shareLinkStatus } from '../../common/firecallShareLink';

/**
 * Tauscht das JWT aus einem Share-Link gegen ein Firebase Custom Token.
 *
 * Die Berechtigungen kommen dabei aus dem **Benutzerdokument**, nicht aus dem
 * JWT-Payload: Das JWT belegt nur, *wer* der Gast ist. Damit lässt sich einem
 * bereits verteilten Link das Schreibrecht nachträglich entziehen oder der
 * Zugang ganz sperren.
 */
export async function exchangeCustomJwtForFirebaseToken(customToken: string) {
  try {
    const payload = await verifyJwt(customToken);

    if (!payload.sub) {
      throw new Error('Invalid token: subject missing');
    }

    const uid = payload.sub;

    const userDoc = await firestore
      .collection(USER_COLLECTION_ID)
      .doc(uid)
      .get();
    if (!userDoc.exists) {
      throw new Error(`no user document for ${uid}`);
    }
    const userData = userDoc.data() as FirebaseUserInfo;
    if (!userData.authorized) {
      throw new Error(`user ${uid} is not authorized`);
    }

    // Ablauf und Entzug wirken über das Benutzerdokument, nicht über das JWT.
    // Ein Gast ohne Ablaufdatum stammt aus der Zeit vor der Link-Verwaltung und
    // gilt damit als abgelaufen.
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
      console.info(`share link for ${uid} is no longer valid`);
      return { error: 'Token expired' };
    }

    const claims: CustomClaims = {
      groups: userData.groups || ['allUsers'],
      isAdmin: !!userData.isAdmin,
      authorized: true,
      firecall: userData.firecall,
      firecallWrite: guestCanWrite(userData),
    };

    console.info(
      `payload: ${JSON.stringify({
        sub: payload.sub,
        firecall: claims.firecall,
        firecallWrite: claims.firecallWrite,
      })}`,
    );

    // `undefined` ist als Developer Claim nicht erlaubt — der firecall-Claim
    // entfällt daher komplett, wenn der Benutzer kein Einsatz-Gast (mehr) ist.
    const firebaseToken = await firebaseAuth.createCustomToken(uid, {
      groups: claims.groups,
      isAdmin: claims.isAdmin,
      authorized: claims.authorized,
      ...(claims.firecall
        ? {
            firecall: claims.firecall,
            firecallWrite: claims.firecallWrite,
            // Die Firestore-Rules prüfen den Ablauf gegen `request.time`.
            ...(userData.firecallExpiresAt
              ? { firecallExpires: userData.firecallExpiresAt }
              : {}),
          }
        : {}),
    });
    return { token: firebaseToken };
  } catch (error: any) {
    console.error('Error exchanging custom token:', error);
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { error: 'Token expired' };
    }
    return { error: 'Invalid token', details: error.message };
  }
}
