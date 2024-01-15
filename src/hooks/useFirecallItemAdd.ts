import { addDoc, collection } from 'firebase/firestore';
import { useCallback } from 'react';
import { getItemClass } from '../components/FirecallItems/elements';
import { firestore } from '../components/firebase/firebase';
import { FirecallItem } from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

export default function useFirecallItemAdd() {
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
        created: new Date().toISOString(),
        creator: email,
      };
      const itemClass = getItemClass(item?.type);
      console.info(
        `add firecall ${itemClass.firebaseCollectionName()}: ${JSON.stringify(
          item
        )}`
      );

      return await addDoc(
        collection(
          firestore,
          'call',
          firecallId,
          itemClass.firebaseCollectionName()
        ),
        newData
      );
    },
    [email, firecallId]
  );
}
