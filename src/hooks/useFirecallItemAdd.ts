import { collection } from 'firebase/firestore';
import { addDoc } from '../lib/firestoreClient';
import { useCallback } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FirecallItem,
} from '../components/firebase/firestore';
import { useSnackbar } from '../components/providers/SnackbarProvider';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';
import { useAuditLog } from './useAuditLog';
import { isAuthError } from './auth/ensureFreshAuth';

// The item-class registry (`../components/FirecallItems/elements`) imports all
// element classes at module top level — several of those (Marker, Area, Line …)
// transitively depend on `leaflet`, which references `window` during import.
// Loading that graph from the server bundle breaks SSR prerendering of pages
// that only need AppProviders but never hit the hook at runtime. Import it
// lazily from inside the callback so the heavy module graph stays in the
// client-only chunk.
async function getFirebaseCollectionName(type: string | undefined) {
  const { getItemClass } = await import(
    '../components/FirecallItems/elements'
  );
  return getItemClass(type).firebaseCollectionName();
}

export default function useFirecallItemAdd() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();
  const showSnackbar = useSnackbar();
  return useCallback(
    async (item: FirecallItem) => {
      const newData: any = {
        datum: new Date().toISOString(),
        ...Object.entries(item)
          .filter(([k, v]) => v !== undefined && v !== null && v !== '')
          .reduce((p, [k, v]) => {
            p[k] = v;
            return p;
          }, {} as any),
        created: new Date().toISOString(),
        creator: email,
      };
      // New items render on top by default: use Date.now() as a monotonically
      // increasing zIndex that is always higher than manually assigned values.
      if (!newData.zIndex) {
        newData.zIndex = Date.now();
      }
      const itemCollection = await getFirebaseCollectionName(item?.type);
      console.info(
        `add firecall ${itemCollection}: ${JSON.stringify(item)}`
      );

      try {
        const docRef = await addDoc(
          collection(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            itemCollection
          ),
          newData
        );

        logChange({
          action: 'create',
          elementType: item.type,
          elementId: docRef.id,
          elementName: item.name || '',
          newValue: newData,
        });

        return docRef;
      } catch (err) {
        console.error('Failed to add firecall item:', err);
        const reloadAction = {
          label: 'Neu laden',
          onClick: () => window.location.reload(),
        };
        if (isAuthError(err)) {
          showSnackbar(
            'Sitzung abgelaufen. Element wurde nicht gespeichert. Bitte Seite neu laden und erneut anmelden.',
            'error',
            reloadAction,
          );
        } else {
          showSnackbar(
            'Element konnte nicht gespeichert werden. Bitte Verbindung prüfen und erneut versuchen.',
            'error',
            reloadAction,
          );
        }
        throw err;
      }
    },
    [email, firecallId, logChange, showSnackbar]
  );
}
