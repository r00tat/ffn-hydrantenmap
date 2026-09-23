import { projectFirecallItem } from '../../common/mcp/itemDto';
import { FirecallItem, FirecallLayer } from '../../components/firebase/firestore';
import { projectLayer } from './layerFields';
import type { AiTruppContext } from '../../components/Atemschutz/truppAssistant';
import { AiContext, AiContextItem, AiInteraction } from './types';

/**
 * Ebenen samt Datenfeldern und die aktive Ebene. Ohne Ebenen fehlt beides, wie
 * die Trupps — der Kontext geht bei jedem Zug hinaus.
 */
function ebenenKontext(layers: FirecallLayer[], activeLayerId: string | undefined) {
  const live = layers.filter((l) => !l.deleted && l.id);
  if (live.length === 0) return {};
  const active = live.find((l) => l.id === activeLayerId);
  return {
    layers: live.map(projectLayer),
    ...(active ? { activeLayer: active.name } : {}),
  };
}

export function buildAiContext({
  map,
  defaultPosition,
  existingItems,
  isPositionSet,
  position,
  interactions,
  trupps,
  layers = [],
  activeLayerId,
}: {
  map: { getCenter: () => { lat: number; lng: number }; getBounds: () => any; getZoom: () => number } | null;
  defaultPosition: { lat: number; lng: number };
  existingItems: FirecallItem[];
  isPositionSet: boolean;
  position: { lat: number; lng: number };
  interactions: AiInteraction[];
  /** Laufende Atemschutztrupps, siehe `truppKontext`. */
  trupps?: AiTruppContext[];
  /** Ebenen des Einsatzes; im Kontext nur, wenn es welche gibt. */
  layers?: FirecallLayer[];
  /** Zuletzt gewählte Ebene, dorthin kommen neue Marker ohne genannte Ebene. */
  activeLayerId?: string;
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
    ...ebenenKontext(layers, activeLayerId),
  };
}
