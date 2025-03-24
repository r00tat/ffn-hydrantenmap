'use client';

import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import useFirecallHistory from '../../hooks/firecallHistory/useFirecallHistory';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import useSelectHistory from '../../hooks/firecallHistory/useSelectHistory';
import { useFirecallId } from '../../hooks/useFirecall';
import { MapEditorContext, MapEditorOptions } from '../../hooks/useMapEditor';
import { firestore } from '../firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_HISTORY_COLLECTION_ID,
  FirecallHistory,
} from '../firebase/firestore';

interface MapEditorProviderProps {
  children: React.ReactNode;
}

function useMapEditorProvider() {
  const [editable, setEditable] = useState(false);
  const { saveHistory, saveInProgress } = useSaveHistory();
  const history = useFirecallHistory();
  const { historyPathSegments, selectHistory, historyId } = useSelectHistory();
  const [selectedHistory, setSelectedHistory] = useState<
    FirecallHistory | undefined
  >();
  const firecallId = useFirecallId();

  useEffect(() => {
    (async () => {
      console.info(`historyPath has changed: ${historyId}`);
      if (historyId) {
        const historyDoc = doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_HISTORY_COLLECTION_ID,
          historyId
        );
        const docSnap = await getDoc(historyDoc);
        if (docSnap.exists()) {
          setSelectedHistory({
            ...docSnap.data(),
            id: historyId,
          } as FirecallHistory);
        } else {
          console.error(`history doc ${historyId} not found`);
          setSelectedHistory(undefined);
        }
      } else {
        setSelectedHistory(undefined);
      }
    })();
  }, [historyId]);

  const options: MapEditorOptions = {
    editable: historyId ? false : editable,
    setEditable,
    saveHistory,
    saveInProgress,
    history,
    historyPathSegments,
    selectHistory,
    historyId,
    selectedHistory,
  };

  return options;
}

export default function MapEditorProvider({
  children,
}: MapEditorProviderProps) {
  const options = useMapEditorProvider();

  return (
    <MapEditorContext.Provider value={options}>
      {children}
    </MapEditorContext.Provider>
  );
}
