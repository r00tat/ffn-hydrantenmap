'use client';

import { useState } from 'react';
import { MapEditorContext, MapEditorOptions } from '../../hooks/useMapEditor';

interface MapEditorProviderProps {
  children: React.ReactNode;
}

export default function MapEditorProvider({
  children,
}: MapEditorProviderProps) {
  const [editable, setEditable] = useState(false);

  const options: MapEditorOptions = {
    editable,
    setEditable,
  };

  return (
    <MapEditorContext.Provider value={options}>
      {children}
    </MapEditorContext.Provider>
  );
}
