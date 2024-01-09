import { addDoc, collection } from 'firebase/firestore';
import React, { FC, ReactNode, useCallback, useContext, useState } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../../hooks/useFirecall';
import { calculateDistance } from '../../FirecallItems/infos/connection';
import { firestore } from '../../firebase/firebase';
import { Connection } from '../../firebase/firestore';

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
        firecallItem.destLat = positions[positions.length - 1].lat;
        firecallItem.destLng = positions[positions.length - 1].lng;
        addDoc(collection(firestore, 'call', firecallId, 'item'), {
          ...firecallItem,
          lat: positions[0].lat,
          lng: positions[0].lng,
          user: email,
          created: new Date().toISOString(),
          positions: JSON.stringify(positions.map((p) => [p.lat, p.lng])),
          distance: Math.round(
            calculateDistance(positions.map((p) => [p.lat, p.lng]))
          ),
        });
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
