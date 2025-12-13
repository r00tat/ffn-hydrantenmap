// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = JSON.parse(
  process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
);

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export default app;
export { app as firebaseApp };
// export const analytics: Analytics = getAnalytics(app);
export const firestore: Firestore = process.env.NEXT_PUBLIC_FIRESTORE_DB
  ? getFirestore(app, process.env.NEXT_PUBLIC_FIRESTORE_DB)
  : getFirestore(app);
export const db = firestore;
export const auth: Auth = getAuth(app);
