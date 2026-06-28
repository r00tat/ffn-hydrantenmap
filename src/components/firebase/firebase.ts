// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = JSON.parse(
  process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
);

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export default app;
export { app as firebaseApp };
// export const analytics: Analytics = getAnalytics(app);

const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DB;

/**
 * Initialize Firestore with a persistent (IndexedDB) offline cache in the
 * browser. With persistence enabled, writes made while offline are queued in
 * the local cache and synced automatically once the connection is restored —
 * this prevents data loss when a tablet has no connection.
 *
 * The persistent cache only works in the browser, so on the server (SSR) and
 * if initialization fails (e.g. an unsupported browser, or the instance was
 * already initialized via fast refresh) we fall back to the default instance.
 */
function createFirestore(): Firestore {
  if (typeof window !== 'undefined') {
    try {
      const settings = {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      };
      return databaseId
        ? initializeFirestore(app, settings, databaseId)
        : initializeFirestore(app, settings);
    } catch {
      // Fall through to the default instance below.
    }
  }
  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const firestore: Firestore = createFirestore();
export const db = firestore;
export const auth: Auth = getAuth(app);
