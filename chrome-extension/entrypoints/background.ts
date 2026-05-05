import { defineBackground } from 'wxt/utils/define-background';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, FIRESTORE_DB } from '@shared/config';

type MessageRequest =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL'; firecallId: string }
  | { type: 'AUTH_STATE_CHANGED' }
  | { type: 'GET_CREW_ASSIGNMENTS' }
  | { type: 'GET_FIRECALL_VEHICLES' }
  | { type: 'GET_FIRECALL_LIST' };

export default defineBackground({
  type: 'module',
  main() {
    const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const auth = getAuth(app);
    const firestore = FIRESTORE_DB
      ? getFirestore(app, FIRESTORE_DB)
      : getFirestore(app);

    let currentUser: User | null = null;
    onAuthStateChanged(auth, (user) => {
      currentUser = user;
    });

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

    async function getFirecallList(): Promise<{
      firecalls: { id: string; name?: string; date?: string }[];
    }> {
      if (!currentUser) return { firecalls: [] };

      const tokenResult = await currentUser.getIdTokenResult();
      const claims = tokenResult.claims;
      const groups = (claims.groups as string[]) || [];
      const firecallClaim = claims.firecall as string | undefined;

      const toEntry = (
        id: string,
        data: { name?: string; date?: string; deleted?: boolean },
      ) => ({ id, name: data.name, date: data.date });

      if (firecallClaim) {
        const snap = await getDoc(doc(firestore, 'call', firecallClaim));
        if (!snap.exists()) return { firecalls: [] };
        const data = snap.data() as {
          name?: string;
          date?: string;
          deleted?: boolean;
        };
        if (data.deleted) return { firecalls: [] };
        return { firecalls: [toEntry(snap.id, data)] };
      }

      if (groups.length === 0) return { firecalls: [] };

      const queryGroups = groups.slice(0, 30);

      const q = query(
        collection(firestore, 'call'),
        where('deleted', '==', false),
        where('group', 'in', queryGroups),
        orderBy('date', 'desc'),
        limit(20),
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) =>
        toEntry(d.id, d.data() as { name?: string; date?: string }),
      );

      const { selectedFirecallId } = await chrome.storage.local.get(
        'selectedFirecallId',
      );
      if (
        selectedFirecallId &&
        !list.some((fc) => fc.id === selectedFirecallId)
      ) {
        try {
          const sel = await getDoc(doc(firestore, 'call', selectedFirecallId));
          if (sel.exists()) {
            const data = sel.data() as {
              name?: string;
              date?: string;
              deleted?: boolean;
            };
            if (!data.deleted) {
              list.push(toEntry(sel.id, data));
              list.sort((a, b) => {
                if (!a.date) return 1;
                if (!b.date) return -1;
                return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
              });
            }
          }
        } catch {
          // Permission or other error — ignore, don't break the list.
        }
      }

      return { firecalls: list };
    }

    async function handleMessage(message: MessageRequest) {
      switch (message.type) {
        case 'AUTH_STATE_CHANGED':
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
            'selectedFirecallId',
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
            'selectedFirecallId',
          );
          if (!selectedFirecallId) return { assignments: [] };
          return getCrewAssignments(selectedFirecallId);
        }

        case 'GET_FIRECALL_VEHICLES': {
          await ensureAuthenticated();
          if (!currentUser) return { error: 'Not authenticated' };
          const { selectedFirecallId } = await chrome.storage.local.get(
            'selectedFirecallId',
          );
          if (!selectedFirecallId) return { vehicles: [] };
          return getFirecallVehicles(selectedFirecallId);
        }

        case 'GET_FIRECALL_LIST': {
          await ensureAuthenticated();
          if (!currentUser) return { error: 'Not authenticated' };
          return getFirecallList();
        }

        default:
          return { error: 'Unknown message type' };
      }
    }

    chrome.runtime.onMessage.addListener(
      (message: MessageRequest, _sender, sendResponse) => {
        handleMessage(message).then(sendResponse);
        return true;
      },
    );

    chrome.runtime.onInstalled.addListener(() => {
      console.log('Einsatzkarte Extension installed');
    });
  },
});
