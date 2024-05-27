'use client';
import { doc, setDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { getItemClass } from '../components/FirecallItems/elements';
import { firestore } from '../components/firebase/firebase';
import { FirecallItem } from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

export default function useFirecallItemUpdate() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();
  return useCallback(
    async (item: FirecallItem) => {
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

      return await setDoc(
        doc(
          firestore,
          'call',
          firecallId,
          itemClass.firebaseCollectionName(),
          '' + item.id
        ),
        newData,
        { merge: false }
      );
    },
    [email, firecallId]
  );
}
