'use server';

import * as firebaseAdmin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// let serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (firebaseAdmin.apps?.length == 0) {
  // make sure we initialize only once
  firebaseAdmin.initializeApp({
    // credential: admin.credential.cert(serviceAccount),
  });
}

export default firebaseAdmin;

export const firestore = process.env.NEXT_PUBLIC_FIRESTORE_DB
  ? getFirestore(firebaseAdmin.app(), process.env.NEXT_PUBLIC_FIRESTORE_DB)
  : firebaseAdmin.firestore();
export const firebaseAuth = getAuth(firebaseAdmin.app());
