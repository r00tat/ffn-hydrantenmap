import { doc, setDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestore } from '../components/firebase/firebase';
import { FirecallItem } from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';

export default function useFirecallItemUpdate(firecallId: string = 'unknown') {
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
        updatedAt: new Date(),
        updatedBy: email,
      };
      console.info(
        `update of firecall item ${item.id}: ${JSON.stringify(item)}`
      );

      await setDoc(
        doc(firestore, 'call', firecallId, 'item', '' + item.id),
        newData,
        { merge: false }
      );
    },
    [email, firecallId]
  );
}
