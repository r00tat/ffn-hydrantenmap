// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
