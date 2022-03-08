import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
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
import { Firecall } from '../components/firebase/firestore';

export const defaultFirecall: Firecall = {
  id: 'unkown',
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

export function useFirecallSwitcher(): FirecallContextType {
  const [firecallId, setFirecallId] = useState<string>();
  const [firecall, setFirecall] = useState<Firecall>();

  useEffect(() => {
    if (!firecallId) {
      setFirecall(undefined);
    } else {
      const unsubscribe = onSnapshot(
        doc(firestore, 'call', firecallId),
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

  const [activeFirecall, setActiveFirecall] = useState<Firecall>();

  useEffect(() => {
    if (firecall) {
      setActiveFirecall(firecall);
    } else {
      setActiveFirecall(lastFirecall);
    }
  }, [firecall, lastFirecall]);

  return { firecall: activeFirecall, setFirecallId };
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
  return firecall?.id || 'unkown';
};

export default useFirecall;
