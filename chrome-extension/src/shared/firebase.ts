import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, FIRESTORE_DB } from './config';
import { initExtensionAppCheck } from './appCheck';

const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);

export const auth: Auth = getAuth(app);
export const firestore: Firestore = FIRESTORE_DB
  ? getFirestore(app, FIRESTORE_DB)
  : getFirestore(app);
export { app as firebaseApp };

// Attach App Check so Firestore and Auth requests from the popup carry a
// verified token. The background worker initializes its own Firebase app and
// calls initExtensionAppCheck separately.
initExtensionAppCheck(app, auth);
