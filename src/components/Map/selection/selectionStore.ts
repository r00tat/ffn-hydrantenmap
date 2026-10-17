/**
 * Zustand der Mehrfachauswahl einer Karte.
 *
 * Ein kleiner externer Store statt React-State im Provider: Jeder Marker fragt
 * über `useSyncExternalStore` nur „bin ich ausgewählt?" bzw. „um wie viel bin
 * ich gerade versetzt?". Ändert sich die Auswahl oder läuft eine Verschiebung,
 * rendern nur die betroffenen Elemente neu — nicht jedes Element der Karte im
 * Takt der Zeigerbewegung.
 *
 * Die Registrierungen sind die Antwort auf „welche Elemente sind gerade auf der
 * Karte?": Jede `FirecallItemsLayer` meldet ihre Elemente zusammen mit einer
 * Prüfung, ob ihre Leaflet-Ebene eingeblendet ist. React-Leaflet hält die
 * Kinder ausgeblendeter Overlays gemountet, das Mounten allein sagt also nichts.
 */
import type { FirecallItem } from '../../firebase/firestore';
import {
  isMultiSelectable,
  SelectionPreview,
  toggleSelected,
} from './multiSelect';

export interface SelectionRegistration {
  items: FirecallItem[];
  isVisible: () => boolean;
}

export interface SelectionState {
  selectedIds: Set<string>;
  /** Touch: ein einfacher Zug zieht den Rahmen statt die Karte zu verschieben. */
  boxMode: boolean;
  preview?: SelectionPreview;
  /** Zählt jede neue Registrierung — für Anzeigen, die Elementdaten brauchen. */
  itemsVersion: number;
}

export interface SelectionStore {
  getState: () => SelectionState;
  subscribe: (listener: () => void) => () => void;
  setSelection: (ids: Iterable<string>) => void;
  toggle: (id: string) => void;
  clear: () => void;
  setBoxMode: (on: boolean) => void;
  setPreview: (preview: SelectionPreview | undefined) => void;
  register: (key: string, registration: SelectionRegistration) => () => void;
  visibleItems: () => FirecallItem[];
  selectedItems: () => FirecallItem[];
  /**
   * Was eine Verschiebung bewegt: ausgewählt, wählbar und auf einer gerade
   * eingeblendeten Ebene. Wer eine Ebene nach dem Auswählen ausblendet,
   * verschiebt deren Elemente nicht unsichtbar mit.
   */
  movableItems: () => FirecallItem[];
}

export function createSelectionStore(): SelectionStore {
  let state: SelectionState = {
    selectedIds: new Set(),
    boxMode: false,
    itemsVersion: 0,
  };
  const listeners = new Set<() => void>();
  const registrations = new Map<string, SelectionRegistration>();

  const update = (patch: Partial<SelectionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const allItems = () => {
    const byId = new Map<string, FirecallItem>();
    for (const reg of registrations.values()) {
      for (const item of reg.items) if (item.id) byId.set(item.id, item);
    }
    return byId;
  };

  /**
   * Nach einer neuen Registrierung: Elemente, die inzwischen gesperrt,
   * gelöscht oder nicht mehr verschiebbar sind, fallen aus der Auswahl.
   * Elemente, die gar nicht mehr gemeldet sind (Ebene gelöscht), ebenso.
   */
  const pruneSelection = () => {
    if (state.selectedIds.size === 0) return state.selectedIds;
    const byId = allItems();
    const kept = [...state.selectedIds].filter((id) => {
      const item = byId.get(id);
      return item !== undefined && isMultiSelectable(item);
    });
    return kept.length === state.selectedIds.size
      ? state.selectedIds
      : new Set(kept);
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSelection: (ids) => update({ selectedIds: new Set(ids) }),
    toggle: (id) => update({ selectedIds: toggleSelected(state.selectedIds, id) }),
    clear: () => {
      if (state.selectedIds.size === 0) return;
      update({ selectedIds: new Set() });
    },
    setBoxMode: (on) => {
      if (state.boxMode !== on) update({ boxMode: on });
    },
    setPreview: (preview) => update({ preview }),
    register: (key, registration) => {
      registrations.set(key, registration);
      update({
        itemsVersion: state.itemsVersion + 1,
        selectedIds: pruneSelection(),
      });
      return () => {
        if (registrations.get(key) === registration) {
          registrations.delete(key);
          update({ itemsVersion: state.itemsVersion + 1 });
        }
      };
    },
    visibleItems: () => {
      const byId = new Map<string, FirecallItem>();
      for (const reg of registrations.values()) {
        if (!reg.isVisible()) continue;
        for (const item of reg.items) if (item.id) byId.set(item.id, item);
      }
      return [...byId.values()];
    },
    selectedItems: () => {
      const byId = allItems();
      return [...state.selectedIds]
        .map((id) => byId.get(id))
        .filter((i): i is FirecallItem => i !== undefined);
    },
    movableItems: () => {
      const visible = new Map<string, FirecallItem>();
      for (const reg of registrations.values()) {
        if (!reg.isVisible()) continue;
        for (const item of reg.items) if (item.id) visible.set(item.id, item);
      }
      return [...state.selectedIds]
        .map((id) => visible.get(id))
        .filter(
          (i): i is FirecallItem => i !== undefined && isMultiSelectable(i)
        );
    },
  };
}
