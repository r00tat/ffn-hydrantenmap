'use client';
import { doc, setDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { getItemClass } from '../components/FirecallItems/elements';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
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
          .filter(([k, v]) => v)
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
