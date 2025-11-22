import { addDoc, collection } from 'firebase/firestore';
import React, { FC, ReactNode, useCallback, useContext, useState } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../../hooks/useFirecall';
import { firestore } from '../../firebase/firebase';
import {
  Connection,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../firebase/firestore';
import { calculateDistance } from '../../FirecallItems/elements/connection/distance';

interface Leitungen {
  isDrawing: boolean;
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  firecallItem?: Connection;
  setFirecallItem: React.Dispatch<React.SetStateAction<Connection | undefined>>;
  complete: (positions: L.LatLng[]) => void;
}

export const LeitungenContext = React.createContext<Leitungen>({
  isDrawing: false,
} as unknown as Leitungen);

export interface LeitungsProviderProps {
  children: ReactNode;
}

export const useLeitungsProvider = (): Leitungen => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [firecallItem, setFirecallItem] = useState<Connection>();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const complete = useCallback(
    (positions: L.LatLng[]) => {
      if (firecallItem) {
        addDoc(
          collection(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            FIRECALL_ITEMS_COLLECTION_ID
          ),
          {
            ...firecallItem,
            lat: positions[0].lat,
            lng: positions[0].lng,
            user: email,
            created: new Date().toISOString(),
            positions: JSON.stringify(positions.map((p) => [p.lat, p.lng])),
            distance: Math.round(
              calculateDistance(positions.map((p) => [p.lat, p.lng]))
            ),
            destLat: positions[positions.length - 1].lat,
            destLng: positions[positions.length - 1].lng,
          }
        );
      }
    },
    [email, firecallId, firecallItem]
  );

  return { isDrawing, setIsDrawing, firecallItem, setFirecallItem, complete };
};

export const LeitungsProvider: FC<LeitungsProviderProps> = ({ children }) => {
  const leitungen = useLeitungsProvider();
  return (
    <LeitungenContext.Provider value={leitungen}>
      {children}
    </LeitungenContext.Provider>
  );
};

export const useLeitungen = () => useContext(LeitungenContext);
