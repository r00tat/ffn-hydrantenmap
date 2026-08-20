import { collection } from 'firebase/firestore';
import React, { FC, ReactNode, useCallback, useContext, useState } from 'react';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../../hooks/useFirecall';
import { addDoc } from '../../../lib/firestoreClient';
import { firestore } from '../../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  MultiPointItem,
} from '../../firebase/firestore';
import { calculateDistance } from '../../FirecallItems/elements/connection/distance';
import { ensureConnectionRouting } from '../../FirecallItems/elements/connection/ensureConnectionRouting';
import { calculateArea } from '../../FirecallItems/elements/area/area';

interface Leitungen {
  isDrawing: boolean;
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  firecallItem?: MultiPointItem;
  setFirecallItem: React.Dispatch<
    React.SetStateAction<MultiPointItem | undefined>
  >;
  complete: (positions: L.LatLng[]) => Promise<void>;
}

export const LeitungenContext = React.createContext<Leitungen>({
  isDrawing: false,
} as unknown as Leitungen);

export interface LeitungsProviderProps {
  children: ReactNode;
}

export const useLeitungsProvider = (): Leitungen => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [firecallItem, setFirecallItem] = useState<MultiPointItem>();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const complete = useCallback(
    async (positions: L.LatLng[]) => {
      if (firecallItem) {
        const latLngPositions = positions.map(
          (p) => [p.lat, p.lng] as [number, number]
        );
        const newItem = {
          ...firecallItem,
          lat: positions[0].lat,
          lng: positions[0].lng,
          user: email,
          created: new Date().toISOString(),
          positions: JSON.stringify(latLngPositions),
          distance: Math.round(calculateDistance(latLngPositions)),
          ...(firecallItem.type === 'area'
            ? { area: Math.round(calculateArea(latLngPositions)) }
            : {}),
          destLat: positions[positions.length - 1].lat,
          destLng: positions[positions.length - 1].lng,
        };
        const docRef = await addDoc(
          collection(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            FIRECALL_ITEMS_COLLECTION_ID
          ),
          newItem
        );

        // Eine neu gezeichnete Leitung mit Straßen-Routing bekommt ihre
        // Geometrie erst hier: Vorher gibt es keine Dokument-ID, unter der sie
        // gespeichert werden könnte.
        await ensureConnectionRouting(firecallId, {
          ...newItem,
          id: docRef.id,
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
