import { projectFirecallItem } from '../../common/mcp/itemDto';
import { FirecallItem } from '../../components/firebase/firestore';
import type { AiTruppContext } from '../../components/Atemschutz/truppAssistant';
import { AiContext, AiContextItem, AiInteraction } from './types';

export function buildAiContext({
  map,
  defaultPosition,
  existingItems,
  isPositionSet,
  position,
  interactions,
  trupps,
}: {
  map: { getCenter: () => { lat: number; lng: number }; getBounds: () => any; getZoom: () => number } | null;
  defaultPosition: { lat: number; lng: number };
  existingItems: FirecallItem[];
  isPositionSet: boolean;
  position: { lat: number; lng: number };
  interactions: AiInteraction[];
  /** Laufende Atemschutztrupps, siehe `truppKontext`. */
  trupps?: AiTruppContext[];
}): AiContext {
  const center = map ? map.getCenter() : defaultPosition;
  const bounds = map ? map.getBounds() : null;

  // Dieselbe Projektion wie der MCP-Server (`projectFirecallItem`): Was der
  // Browser-Assistent im Kontext sieht und was ein externer Client über MCP
  // bekommt, soll nicht auseinanderlaufen.
  const contextItems: AiContextItem[] = existingItems
    .filter((i) => !i.deleted)
    .map((item) => projectFirecallItem(item));

  return {
    mapCenter: { lat: center.lat, lng: center.lng },
    mapBounds: bounds
      ? {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        }
      : { north: center.lat, south: center.lat, east: center.lng, west: center.lng },
    zoomLevel: map ? map.getZoom() : 15,
    existingItems: contextItems,
    userPosition: isPositionSet ? { lat: position.lat, lng: position.lng } : null,
    recentInteractions: interactions,
    // Nur mit Trupps: Der Kontext geht bei jedem Zug hinaus und soll dort,
    // wo kein Atemschutz läuft, nicht wachsen.
    ...(trupps && trupps.length > 0 ? { atemschutzTrupps: trupps } : {}),
  };
}
