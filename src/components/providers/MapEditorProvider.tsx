'use client';

import { useState } from 'react';
import { MapEditorContext, MapEditorOptions } from '../../hooks/useMapEditor';
import { useSaveHistory } from '../../hooks/firecallHistory/useSaveHistory';
import useFirecallHistory from '../../hooks/firecallHistory/useFirecallHistory';

interface MapEditorProviderProps {
  children: React.ReactNode;
}

export default function MapEditorProvider({
  children,
}: MapEditorProviderProps) {
  const [editable, setEditable] = useState(false);
  const { saveHistory, saveInProgress } = useSaveHistory();
  const history = useFirecallHistory();

  const options: MapEditorOptions = {
    editable,
    setEditable,
    saveHistory,
    saveInProgress,
    history,
  };

  return (
    <MapEditorContext.Provider value={options}>
      {children}
    </MapEditorContext.Provider>
  );
}
