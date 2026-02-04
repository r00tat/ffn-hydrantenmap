'use client';

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from 'react';
import { db, firestore } from '../components/firebase/firebase';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
} from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';

export const defaultFirecall: Firecall = {
  id: 'unknown',
  name: '',
};

export interface FirecallContextType {
  firecall: Firecall | undefined;
  setFirecallId?: Dispatch<SetStateAction<string | undefined>>;
}

export const FirecallContext = createContext<FirecallContextType>({
  firecall: defaultFirecall,
});

export function useLastFirecall() {
  const [firecall, setFirecall] = useState<Firecall>(defaultFirecall);
  const { isAuthorized, groups, firecall: firecallClaim } = useFirebaseLogin();

  useEffect(() => {
    if (isAuthorized) {
      if (!firecallClaim) {
        const q = query(
          collection(db, FIRECALL_COLLECTION_ID),
          where('deleted', '==', false),
          where('group', 'in', groups),
          orderBy('date', 'desc'),
          limit(1)
        );
        const unsub = onSnapshot(q, async (querySnapshot) => {
          if (!querySnapshot.empty) {
            const firstDoc = querySnapshot.docs[0];
            const fc: Firecall = {
              id: firstDoc.id,
              group: 'ffnd',
              ...firstDoc.data(),
            } as Firecall;
            setFirecall(fc);
            console.log(`Current firecall ${fc.id} ${fc.name} ${fc.date}`, fc);
          } else {
            console.info(`no firecalls received`);
          }
        });
        return () => {
          unsub();
        };
      } else {
        // we can only query the one and only firecall

        const unsub = onSnapshot(
          doc(firestore, FIRECALL_COLLECTION_ID, firecallClaim),
          (doc) => {
            if (doc.exists()) {
              const fc: Firecall = {
                id: doc.id,
                ...doc.data(),
              } as Firecall;
              setFirecall(fc);
              console.log(
                `Current firecall ${fc.id} ${fc.name} ${fc.date}`,
                fc
              );
            } else {
              console.warn(
                `firecall from claim with id ${firecallClaim} not found!`
              );
            }
          }
        );
        return () => {
          unsub();
        };
      }
    } else {
      return () => {};
    }
  }, [firecallClaim, groups, isAuthorized]);

  return firecall;
}

export function useFirecallSwitcher(): FirecallContextType {
  const [firecallId, setFirecallId] = useState<string>();
  const [firecall, setFirecall] = useState<Firecall>();

  useEffect(() => {
    if (!firecallId) {
      const unsetFirecall = async () => {
        setFirecall(undefined);
      };
      unsetFirecall();
    } else {
      const unsubscribe = onSnapshot(
        doc(firestore, FIRECALL_COLLECTION_ID, firecallId),
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            const fc: Firecall = {
              id: docSnapshot.id,
              ...docSnapshot.data(),
            } as Firecall;
            setFirecall(fc);
            console.log(
              `selected firecall ${fc.id} ${fc.name} ${
                fc.date
              }: ${JSON.stringify(fc)}`
            );
          } else {
            console.warn(`firecall with id ${firecallId} not found!`);
          }
        }
      );
      return () => {
        unsubscribe();
      };
    }
  }, [firecallId]);

  return {
    firecall,
    setFirecallId,
  };
}

export function useLastOrSelectedFirecall(): FirecallContextType {
  const lastFirecall = useLastFirecall();
  const { firecall, setFirecallId } = useFirecallSwitcher();

  return { firecall: firecall || lastFirecall, setFirecallId };
}

export const useFirecallSelect = ():
  | Dispatch<SetStateAction<string | undefined>>
  | undefined => {
  const { setFirecallId } = useContext(FirecallContext);
  return setFirecallId;
};

export const useFirecall = (): Firecall => {
  const { firecall } = useContext(FirecallContext);
  return firecall || defaultFirecall;
};

export const useFirecallId = (): string => {
  const { firecall } = useContext(FirecallContext);
  return firecall?.id || 'unknown';
};

export default useFirecall;
