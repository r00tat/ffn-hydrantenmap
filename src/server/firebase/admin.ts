import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';

// let serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS;

const apps = getApps();

if (apps?.length == 0) {
  // make sure we initialize only once
  initializeApp({
    // credential: admin.credential.cert(serviceAccount),
  });
}

export const firebaseApp = getApp();

export const firestore = process.env.NEXT_PUBLIC_FIRESTORE_DB
  ? getFirestore(firebaseApp, process.env.NEXT_PUBLIC_FIRESTORE_DB)
  : getFirestore(firebaseApp);
export const firebaseAuth = getAuth(firebaseApp);
