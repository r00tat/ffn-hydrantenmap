import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { FIREBASE_CONFIG, FIRESTORE_DB } from '../shared/config';

// Initialize Firebase in service worker context
const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const firestore = FIRESTORE_DB
  ? getFirestore(app, FIRESTORE_DB)
  : getFirestore(app);

// Track current user
let currentUser: User | null = null;
onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

/**
 * Try to authenticate the service worker using the cached chrome.identity token.
 * This works without user interaction if the popup has already logged in.
 */
async function ensureAuthenticated(): Promise<boolean> {
  if (currentUser) return true;

  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(false);
        return;
      }
      try {
        const credential = GoogleAuthProvider.credential(null, token);
        const result = await signInWithCredential(auth, credential);
        currentUser = result.user;
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  });
}

// Message types for content script communication
type MessageRequest =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL'; firecallId: string }
  | { type: 'AUTH_STATE_CHANGED' }
  | { type: 'GET_CREW_ASSIGNMENTS' }
  | { type: 'GET_FIRECALL_VEHICLES' };

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // Keep channel open for async response
  }
);

async function handleMessage(message: MessageRequest) {
  switch (message.type) {
    case 'AUTH_STATE_CHANGED':
      // Popup notifies us of login/logout — re-check auth
      await ensureAuthenticated();
      return { ok: true };

    case 'GET_AUTH_STATE':
      await ensureAuthenticated();
      return {
        isLoggedIn: !!currentUser,
        email: currentUser?.email || null,
      };

    case 'GET_CURRENT_FIRECALL': {
      await ensureAuthenticated();
      if (!currentUser) return { error: 'Not authenticated' };
      const { selectedFirecallId } = await chrome.storage.local.get(
        'selectedFirecallId'
      );
      if (!selectedFirecallId) return { firecall: null };
      return getFirecallData(selectedFirecallId);
    }

    case 'GET_FIRECALL': {
      await ensureAuthenticated();
      if (!currentUser) return { error: 'Not authenticated' };
      return getFirecallData(message.firecallId);
    }

    case 'GET_CREW_ASSIGNMENTS': {
      await ensureAuthenticated();
      if (!currentUser) return { error: 'Not authenticated' };
      const { selectedFirecallId } = await chrome.storage.local.get(
        'selectedFirecallId'
      );
      if (!selectedFirecallId) return { assignments: [] };
      return getCrewAssignments(selectedFirecallId);
    }

    case 'GET_FIRECALL_VEHICLES': {
      await ensureAuthenticated();
      if (!currentUser) return { error: 'Not authenticated' };
      const { selectedFirecallId } = await chrome.storage.local.get(
        'selectedFirecallId'
      );
      if (!selectedFirecallId) return { vehicles: [] };
      return getFirecallVehicles(selectedFirecallId);
    }

    default:
      return { error: 'Unknown message type' };
  }
}

async function getFirecallData(firecallId: string) {
  const docSnap = await getDoc(doc(firestore, 'call', firecallId));
  if (!docSnap.exists()) return { firecall: null };
  return { firecall: { ...docSnap.data(), id: docSnap.id } };
}

async function getCrewAssignments(firecallId: string) {
  const crewRef = collection(firestore, 'call', firecallId, 'crew');
  const snapshot = await getDocs(crewRef);
  const assignments = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  return { assignments };
}

async function getFirecallVehicles(firecallId: string) {
  const itemsRef = collection(firestore, 'call', firecallId, 'item');
  const snapshot = await getDocs(itemsRef);
  const vehicles = snapshot.docs
    .map((d) => {
      const data = d.data() as {
        type?: string;
        name?: string;
        deleted?: boolean;
      };
      return {
        id: d.id,
        type: data.type,
        name: data.name,
        deleted: data.deleted,
      };
    })
    .filter((v) => v.type === 'vehicle' && v.deleted !== true && !!v.name)
    .map((v) => ({ id: v.id, name: v.name as string }));
  return { vehicles };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Einsatzkarte Extension installed');
});
