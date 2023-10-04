import { doc, setDoc } from 'firebase/firestore';
import { useCallback } from 'react';
import { firestore } from '../components/firebase/firebase';
import { FirecallItem } from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';

export default function useFirecallItemUpdate(firecallId: string = 'unknown') {
  const { email } = useFirebaseLogin();
  return useCallback(
    async (item: FirecallItem) => {
      console.info(
        `update of firecall item ${item.id}: ${JSON.stringify(item)}`
      );
      await setDoc(
        doc(firestore, 'call', firecallId, 'item', '' + item.id),
        {
          datum: new Date().toISOString(),
          ...item,
          updatedAt: new Date(),
          updatedBy: email,
        },
        { merge: true }
      );
    },
    [email, firecallId]
  );
}
