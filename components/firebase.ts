// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from 'firebase/app';
import { Analytics, getAnalytics } from 'firebase/analytics';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Auth, getAuth } from 'firebase/auth';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyDqwuz8Loo9ybLwEbvSit0xw_Eh5DLPvnw',
  authDomain: 'ffn-utils.firebaseapp.com',
  projectId: 'ffn-utils',
  storageBucket: 'ffn-utils.appspot.com',
  messagingSenderId: '429163084278',
  appId: '1:429163084278:web:88f28b36e5ef0f90292fd7',
  measurementId: 'G-HHJVD820M1',
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export default app;
export { app as firebaseApp };
export const analytics: Analytics = getAnalytics(app);
export const firestore: Firestore = getFirestore(app);
export const db = firestore;
export const auth: Auth = getAuth(app);
