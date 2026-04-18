'use client';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { getItemClass } from '../components/FirecallItems/elements';
import { firestore } from '../components/firebase/firebase';
import {
  DataSchemaField,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../components/firebase/firestore';
import { computeAllFields } from '../common/computeFieldValue';
import { useSnackbar } from '../components/providers/SnackbarProvider';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';
import { useAuditLog } from './useAuditLog';
import { withFreshAuth } from './auth/withFreshAuth';
import { isAuthError } from './auth/ensureFreshAuth';

export default function useFirecallItemUpdate() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();
  const showSnackbar = useSnackbar();
  return useCallback(
    async (item: FirecallItem, previousItem?: FirecallItem) => {
      const newData: any = {
        datum: new Date().toISOString(),
        ...Object.entries(item)
          .filter(([k, v]) => v !== undefined && v !== null && v !== '')
          .reduce((p, [k, v]) => {
            p[k] = v;
            return p;
          }, {} as any),
        updatedAt: new Date().toISOString(),
        updatedBy: email,
      };
      const itemClass = getItemClass(item?.type);
      console.info(
        `update of firecall ${itemClass.firebaseCollectionName()} ${
          item.id
        }: ${JSON.stringify(item)}`
      );

      try {
        await withFreshAuth(() =>
          setDoc(
            doc(
              firestore,
              FIRECALL_COLLECTION_ID,
              firecallId,
              itemClass.firebaseCollectionName(),
              '' + item.id
            ),
            newData,
            { merge: false }
          )
        );

        // When a layer is deleted, cascade to all items in that layer
        if (item.type === 'layer' && item.deleted === true && item.id) {
          const itemsCol = collection(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            FIRECALL_ITEMS_COLLECTION_ID
          );
          const snapshot = await getDocs(
            query(itemsCol, where('layer', '==', item.id))
          );
          if (!snapshot.empty) {
            const batch = writeBatch(firestore);
            const now = new Date().toISOString();
            snapshot.docs.forEach((d) => {
              batch.update(d.ref, { deleted: true, updatedAt: now, updatedBy: email });
            });
            await batch.commit();
          }
        }

        // When a layer's dataSchema changes and has computed fields, recalculate all items
        if (item.type === 'layer' && item.id && !item.deleted) {
          const schema = (item as any).dataSchema as DataSchemaField[] | undefined;
          const hasComputed = schema?.some((f) => f.type === 'computed' && f.formula);
          if (hasComputed && schema) {
            const itemsCol = collection(
              firestore,
              FIRECALL_COLLECTION_ID,
              firecallId,
              FIRECALL_ITEMS_COLLECTION_ID
            );
            const snapshot = await getDocs(
              query(itemsCol, where('layer', '==', item.id))
            );
            if (!snapshot.empty) {
              const batch = writeBatch(firestore);
              const now = new Date().toISOString();
              let hasUpdates = false;
              for (const d of snapshot.docs) {
                const data = d.data();
                const fieldData = (data.fieldData || {}) as Record<string, string | number | boolean>;
                const computed = await computeAllFields(fieldData, schema);
                if (Object.keys(computed).length > 0) {
                  const updatedFieldData = { ...fieldData, ...computed };
                  batch.update(d.ref, {
                    fieldData: updatedFieldData,
                    updatedAt: now,
                    updatedBy: email,
                  });
                  hasUpdates = true;
                }
              }
              if (hasUpdates) {
                await batch.commit();
              }
            }
          }
        }

        const prev = previousItem || item.original;
        logChange({
          action: 'update',
          elementType: item.type,
          elementId: item.id || '',
          elementName: item.name || '',
          ...(prev
            ? { previousValue: { ...prev, original: undefined, eventHandlers: undefined } }
            : {}),
          newValue: newData,
        });
      } catch (err) {
        console.error('Failed to update firecall item:', err);
        const reloadAction = {
          label: 'Neu laden',
          onClick: () => window.location.reload(),
        };
        if (isAuthError(err)) {
          showSnackbar(
            'Sitzung abgelaufen. Änderung wurde nicht gespeichert. Bitte Seite neu laden und erneut anmelden.',
            'error',
            reloadAction,
          );
        } else {
          showSnackbar(
            'Element konnte nicht aktualisiert werden. Bitte Verbindung prüfen und erneut versuchen.',
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
