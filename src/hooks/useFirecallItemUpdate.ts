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
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
} from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';
import { useAuditLog } from './useAuditLog';

export default function useFirecallItemUpdate() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  const logChange = useAuditLog();
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

      await setDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          itemClass.firebaseCollectionName(),
          '' + item.id
        ),
        newData,
        { merge: false }
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
    },
    [email, firecallId, logChange]
  );
}
