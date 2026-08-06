'use server';
import 'server-only';

import { firebaseAuth, firestore } from '../../server/firebase/admin';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import {
  CustomClaims,
  setCustomClaimsForUser,
} from '../api/users/[uid]/updateUser';
import { CreateRequest } from 'firebase-admin/auth';
import { actionUserAuthorizedForFirecall } from '../auth';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createJwt, verifyJwt } from './jwt';
import { FirebaseUserInfo } from '../../common/users';
import { guestCanWrite, guestDisplayName } from '../../common/firecallGuest';

export interface FirecallShareLinkOptions {
  /** Anzeigename des Gasts, im Share-Dialog Pflichtfeld. */
  name: string;
  /** `true` = Lesen und Schreiben, `false` = nur Lesen. */
  canWrite: boolean;
}

export async function createCustomFirebaseTokenForFirecall(
  firecallId: string,
  options: FirecallShareLinkOptions,
) {
  if (!firecallId) {
    throw new Error('firecall parameter is missing');
  }

  // Schreibrecht erforderlich: ein Nur-Lese-Gast darf sich nicht über einen
  // selbst erzeugten Link ein Schreibrecht beschaffen.
  const firecall = await actionUserAuthorizedForFirecall(firecallId, {
    requireWrite: true,
  });

  try {
    const displayName = guestDisplayName(options?.name, firecall.name);
    const canWrite = !!options?.canWrite;
    const digest = crypto.hash('sha256', uuidv4()).substring(0, 8);

    // 1. Create a new anonymous user
    const userBaseData: CreateRequest = {
      displayName,
      email: `firecall+${firecallId}-${digest}@ff-neusiedlamsee.at`,
      emailVerified: true,
    };
    const userRecord = await firebaseAuth.createUser(userBaseData);
    const uid = userRecord.uid;

    // 2. Set user data in Firestore and set custom claims
    const userData = {
      ...userBaseData,
      authorized: true,
      groups: ['allUsers'],
      isAdmin: false,
      firecall: firecallId,
      firecallWrite: canWrite,
    };

    await firestore.collection(USER_COLLECTION_ID).doc(uid).set(userData);

    const customClaims: CustomClaims = {
      groups: ['allUsers'],
      isAdmin: false,
      authorized: true,
      firecall: firecallId,
      firecallWrite: canWrite,
    };
    await setCustomClaimsForUser(uid, customClaims);

    // 3. Create a custom token with firecall claim
    // const token = await firebaseAuth.createCustomToken(uid, customClaims);
    const token = await createJwt({ ...userData, uid }, uid, '1 week');

    return { token };
  } catch (error: any) {
    console.error('Error creating custom token:', error);
    return { error: 'Internal Server Error', details: error.message };
  }
}

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
        ? { firecall: claims.firecall, firecallWrite: claims.firecallWrite }
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
