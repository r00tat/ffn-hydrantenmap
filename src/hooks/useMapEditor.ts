'use client';

import { Dispatch, SetStateAction, createContext, useContext } from 'react';
import {
  FirecallHistory,
  FirecallItem,
} from '../components/firebase/firestore';

export interface MapEditorOptions {
  /**
   * Darf der Benutzer den Einsatz überhaupt bearbeiten? `false` für
   * Einsatz-Gäste mit Nur-Lese-Zugriff (siehe `useFirecallWriteAccess`).
   */
  canWrite: boolean;
  editable: boolean;
  setEditable: Dispatch<SetStateAction<boolean>>;
  saveHistory: (description?: string) => void;
  saveInProgress: boolean;
  history: FirecallHistory[];
  historyId?: string;
  selectHistory: (history?: string) => void;
  historyPathSegments: string[];
  selectedHistory?: FirecallHistory;
  historyModeActive: boolean;
  selectFirecallItem: (item?: FirecallItem) => void;
  selectedFirecallItem?: FirecallItem;
  openFirecallItemDialog: (item?: FirecallItem) => void;
  editFirecallItemIsOpen: boolean;
  setEditFirecallItemIsOpen: Dispatch<SetStateAction<boolean>>;
  editFirecallItem?: FirecallItem;
  lastSelectedLayer: string;
  setLastSelectedLayer: Dispatch<SetStateAction<string>>;
}

export const MapEditorContext = createContext<MapEditorOptions>({
  canWrite: true,
  editable: true,
  setEditable: () => {},
  saveHistory: () => {},
  saveInProgress: false,
  history: [],
  selectHistory: () => {},
  historyPathSegments: [],
  historyModeActive: false,
  selectFirecallItem: () => {},
  openFirecallItemDialog: () => {},
  editFirecallItemIsOpen: false,
  setEditFirecallItemIsOpen: () => {},
  lastSelectedLayer: '',
  setLastSelectedLayer: () => {},
});

export default function useMapEditor() {
  return useContext(MapEditorContext);
}

export function useMapEditable() {
  const { editable } = useMapEditor();
  return editable;
}

export function useHistoryPathSegments() {
  const { historyPathSegments } = useMapEditor();
  return historyPathSegments;
}

export function useHistoryModeActive() {
  const { historyModeActive } = useMapEditor();
  return historyModeActive;
}

export function useMapEditorCanEdit() {
  const { historyModeActive, canWrite } = useMapEditor();
  return !historyModeActive && canWrite;
}
