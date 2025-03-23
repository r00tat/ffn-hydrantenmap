'use client';

import { Dispatch, SetStateAction, createContext, useContext } from 'react';
import { FirecallHistory } from '../components/firebase/firestore';

export interface MapEditorOptions {
  editable: boolean;
  setEditable: Dispatch<SetStateAction<boolean>>;
  saveHistory: (description?: string) => void;
  saveInProgress: boolean;
  history: FirecallHistory[];
}

export const MapEditorContext = createContext<MapEditorOptions>({
  editable: true,
  setEditable: () => {},
  saveHistory: () => {},
  saveInProgress: false,
  history: [],
});

export default function useMapEditor() {
  return useContext(MapEditorContext);
}

export function useMapEditable() {
  const { editable } = useMapEditor();
  return editable;
}
