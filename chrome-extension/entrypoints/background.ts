import { defineBackground } from 'wxt/utils/define-background';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  type User,
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
import { initExtensionAppCheck } from '@shared/appCheck';
import {
  FAHRTENBUCH_COLLECTION_ID,
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  GROUP_COLLECTION_ID,
  resolveEinsatzVehicleKilometers,
  type EinsatzVehicleKm,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '@shared/types';

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

    // App Check for the service worker context. Must run before the first
    // Firestore call so requests carry a verified token; the custom provider
    // only produces one once a user is signed in (see @shared/appCheck).
    initExtensionAppCheck(app, auth);

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

    /**
     * Die Kilometer aus dem Fahrtenbuch zu den Fahrzeugen dieses Einsatzes.
     *
     * Gelesen wird die Fahrtenbuch-Gruppe des Einsatzes (`call.group`) —
     * Stammdaten und die Fahrten zu diesem Einsatz. Die Zuordnung
     * Fahrzeugname → Fahrt und die Zählerdifferenz rechnet
     * `resolveEinsatzVehicleKilometers` in der App.
     *
     * Ein Fehler hier darf die Material-Übernahme nicht abbrechen: Wer nicht
     * Mitglied der Fahrtenbuch-Gruppe ist, darf die Fahrten nicht lesen (siehe
     * `fahrtenbuchMember()` in firestore.rules), soll aber weiterhin Fahrzeuge
     * nach SYBOS übernehmen können — dann eben ohne Kilometer. Deshalb `[]`
     * statt eines Wurfs; die Zeilen bleiben in SYBOS unverändert und die
     * Extension meldet sie als „ohne Kilometer".
     */
    async function getFirecallVehicleKilometers(
      firecallId: string,
      vehicleNames: string[],
    ): Promise<EinsatzVehicleKm[]> {
      if (vehicleNames.length === 0) return [];
      try {
        const firecallSnap = await getDoc(doc(firestore, 'call', firecallId));
        const groupId = (firecallSnap.data() as { group?: string } | undefined)
          ?.group;
        if (!groupId) return [];

        const groupRef = doc(firestore, GROUP_COLLECTION_ID, groupId);
        const [vehicleSnap, entrySnap] = await Promise.all([
          getDocs(collection(groupRef, FAHRTENBUCH_VEHICLE_COLLECTION_ID)),
          getDocs(
            query(
              collection(groupRef, FAHRTENBUCH_COLLECTION_ID),
              where('firecallId', '==', firecallId),
              where('deleted', '==', false),
            ),
          ),
        ]);

        return resolveEinsatzVehicleKilometers(vehicleNames, {
          firecallId,
          vehicles: vehicleSnap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as FahrtenbuchVehicle,
          ),
          entries: entrySnap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as FahrtenbuchEntry,
          ),
        });
      } catch (err) {
        console.warn('[EK] Fahrtenbuch-Kilometer nicht lesbar:', err);
        return [];
      }
    }

    async function getFirecallVehicles(firecallId: string) {
      const itemsRef = collection(firestore, 'call', firecallId, 'item');
      const snapshot = await getDocs(itemsRef);
      const items = snapshot.docs
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

      const kilometers = await getFirecallVehicleKilometers(
        firecallId,
        items.map((v) => v.name),
      );

      const vehicles = items.map((v, index) => {
        const km = kilometers[index];
        return { ...v, kilometers: km?.km, kilometersMissing: km?.missing };
      });
      return { vehicles };
    }

    async function getFirecallList(): Promise<{
      firecalls: {
        id: string;
        name?: string;
        date?: string;
        description?: string;
      }[];
    }> {
      if (!currentUser) return { firecalls: [] };

      const tokenResult = await currentUser.getIdTokenResult();
      const claims = tokenResult.claims;
      const groups = (claims.groups as string[]) || [];
      const firecallClaim = claims.firecall as string | undefined;

      const toEntry = (
        id: string,
        data: {
          name?: string;
          date?: string;
          description?: string;
          deleted?: boolean;
        },
      ) => ({
        id,
        name: data.name,
        date: data.date,
        // The panel matches the SYBOS Einsatzstichwort against name AND
        // description — the name alone is often just "Brand".
        description: data.description,
      });

      if (firecallClaim) {
        const snap = await getDoc(doc(firestore, 'call', firecallClaim));
        if (!snap.exists()) return { firecalls: [] };
        const data = snap.data() as {
          name?: string;
          date?: string;
          description?: string;
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
        toEntry(
          d.id,
          d.data() as { name?: string; date?: string; description?: string },
        ),
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
              description?: string;
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
