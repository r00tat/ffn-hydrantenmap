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

export async function createCustomFirebaseTokenForFirecall(firecallId: string) {
  if (!firecallId) {
    throw new Error('firecall parameter is missing');
  }

  const firecall = await actionUserAuthorizedForFirecall(firecallId);

  try {
    const digest = crypto.hash('sha256', uuidv4()).substring(0, 8);

    // 1. Create a new anonymous user
    const userBaseData: CreateRequest = {
      displayName: `Einsatz-Gast ${firecall.name} ${digest}`,
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
    };

    await firestore.collection(USER_COLLECTION_ID).doc(uid).set(userData);

    const customClaims: CustomClaims = {
      groups: ['allUsers'],
      isAdmin: false,
      authorized: true,
      firecall: firecallId,
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

export async function exchangeCustomJwtForFirebaseToken(customToken: string) {
  try {
    const payload = await verifyJwt(customToken);

    if (!payload.sub) {
      throw new Error('Invalid token: subject missing');
    }

    const uid = payload.sub;

    console.info(`payload: ${JSON.stringify(payload)}`);

    // all claims should be configured on the user
    const firebaseToken = await firebaseAuth.createCustomToken(uid, {
      firecall: payload.firecall,
      groups: payload.groups,
      isAdmin: payload.isAdmin,
      authorized: payload.authorized,
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
