'use client';

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  createContext,
  Dispatch,
  SetStateAction,
  useCallback,
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
  setSheet?: (sheetId: string, range?: string) => void;
}

export const FirecallContext = createContext<FirecallContextType>({
  firecall: defaultFirecall,
});

export function useLastFirecall() {
  const [firecall, setFirecall] = useState<Firecall>();
  const { isAuthorized, groups } = useFirebaseLogin();

  useEffect(() => {
    if (isAuthorized) {
      const q = query(
        collection(db, FIRECALL_COLLECTION_ID),
        where('deleted', '==', false),
        where('group', 'in', groups),
        orderBy('date', 'desc'),
        limit(1)
      );
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
        unsubscribe();
      };
    } else {
      setFirecall(defaultFirecall);
    }
  }, [groups, isAuthorized]);

  return firecall;
}

export function useFirecallSwitcher(): FirecallContextType {
  const [firecallId, setFirecallId] = useState<string>();
  const [firecall, setFirecall] = useState<Firecall>();

  useEffect(() => {
    if (!firecallId) {
      setFirecall(undefined);
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

function useUpdateSpreadsheet(firecallId?: string) {
  return useCallback(
    async (sheetId: string, sheetRange?: string) => {
      if (firecallId) {
        await setDoc(
          doc(firestore, FIRECALL_COLLECTION_ID, firecallId),
          {
            updatedAt: new Date().toISOString(),
            sheetId: sheetId || '',
            sheetRange: sheetRange || '',
          },
          { merge: true }
        );
      }
    },
    [firecallId]
  );
}

export function useLastOrSelectedFirecall(): FirecallContextType {
  const lastFirecall = useLastFirecall();
  const { firecall, setFirecallId } = useFirecallSwitcher();

  const [activeFirecall, setActiveFirecall] = useState<Firecall>();
  const setSheet = useUpdateSpreadsheet(activeFirecall?.id);

  useEffect(() => {
    if (firecall) {
      setActiveFirecall(firecall);
    } else {
      setActiveFirecall(lastFirecall);
    }
  }, [firecall, lastFirecall]);

  return { firecall: activeFirecall, setFirecallId, setSheet };
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

const updateSheetFallback = async (sheetId: string, shetRange?: string) => {
  console.warn(`update sheet not implemented in context!`);
};

export const useFirecallUpdateSheet = () => {
  const { setSheet } = useContext(FirecallContext);
  return setSheet || updateSheetFallback;
};

export default useFirecall;
