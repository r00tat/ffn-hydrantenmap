import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, FIRESTORE_DB } from './config';

const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth: Auth = getAuth(app);
export const firestore: Firestore = FIRESTORE_DB
  ? getFirestore(app, FIRESTORE_DB)
  : getFirestore(app);
export { app as firebaseApp };
