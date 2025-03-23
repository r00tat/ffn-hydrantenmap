'use client';

import {
  Dispatch,
  SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface MapEditorOptions {
  editable: boolean;
  setEditable: Dispatch<SetStateAction<boolean>>;
}

export const MapEditorContext = createContext<MapEditorOptions>({
  editable: true,
  setEditable: () => {},
});

export default function useMapEditor() {
  return useContext(MapEditorContext);
}

export function useMapEditable() {
  const { editable } = useMapEditor();
  return editable;
}
