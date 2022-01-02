import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../components/firebase';

export interface Firecall {
  id: string;
  name: string;
  date?: Date;
  description?: string;
  [key: string]: any;
}

export const defaultFirecall = {
  id: 'unkown',
  name: 'unkown',
};

export const FirecallContext = createContext<Firecall>(defaultFirecall);

export function useFirecall() {
  const [firecall, setFirecall] = useState<Firecall>();

  useEffect(() => {
    const q = query(collection(db, 'call'), orderBy('date', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const firstDoc = querySnapshot.docs[0];
        const fc: Firecall = {
          id: firstDoc.id,
          ...firstDoc.data(),
        } as Firecall;
        setFirecall(fc);
        console.log(`Current firecall ${fc.id} ${fc.name} ${fc.date}`);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return firecall;
}

const useLastFirecall = (): Firecall => {
  return useContext(FirecallContext);
};

export default useLastFirecall;
