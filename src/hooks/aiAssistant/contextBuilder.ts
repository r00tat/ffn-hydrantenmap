import { projectFirecallItem } from '../../common/mcp/itemDto';
import { FirecallItem, FirecallLayer } from '../../components/firebase/firestore';
import { isMeasurementLayer, itemTime } from './findItems';
import { type AiContextLayer, projectLayer } from './layerFields';
import type { AiTruppContext } from '../../components/Atemschutz/truppAssistant';
import type { AssistantMemory } from './assistantMemory';
import { AiContext, AiContextItem, AiInteraction, AiMemoryContext } from './types';

/**
 * Ebenen samt Datenfeldern und die aktive Ebene. Ohne Ebenen fehlt beides, wie
 * die Trupps — der Kontext geht bei jedem Zug hinaus.
 */
function ebenenKontext(
  layers: FirecallLayer[],
  activeLayerId: string | undefined,
  items: FirecallItem[],
) {
  const live = layers.filter((l) => !l.deleted && l.id);
  if (live.length === 0) return {};
  const active = live.find((l) => l.id === activeLayerId);
  return {
    layers: live.map((layer): AiContextLayer => {
      const projected = projectLayer(layer);
      if (!isMeasurementLayer(layer)) return projected;
      const punkte = items
        .filter((i) => i.layer === layer.id)
        .sort((a, b) => itemTime(b) - itemTime(a));
      const latest = punkte[0];
      return {
        ...projected,
        measurements: punkte.length,
        ...(latest
          ? {
              latest: {
                id: latest.id!,
                name: latest.name,
                ...(latest.fieldData ? { fieldData: latest.fieldData } : {}),
              },
            }
          : {}),
      };
    }),
    ...(active ? { activeLayer: active.name } : {}),
  };
}

/**
 * Das Gedächtnis: Notizen ohne Zeitstempel, das vorige Gespräch unverändert.
 * Ohne beides fehlt der Abschnitt, wie die Trupps.
 */
function gedaechtnisKontext(memory: AssistantMemory | undefined): { memory?: AiMemoryContext } {
  if (!memory) return {};
  const notes = memory.notes.map(({ id, text }) => ({ id, text }));
  const previous = memory.lastConversation;
  if (notes.length === 0 && !previous) return {};
  return {
    memory: {
      notes,
      ...(previous ? { previousConversation: previous } : {}),
    },
  };
}

/** Einträge statt Kartenelemente: wachsen im Einsatz ohne Grenze. */
const ENTRY_TYPES = new Set(['diary', 'gb']);
/** So viele Tagebucheinträge stehen im Kontext, der Rest über `findItems`. */
const LATEST_DIARY = 5;

/**
 * Ein Element im Überblick: die Projektion des MCP-Servers ohne Koordinaten
 * und Messwerte. Wohin „neben das TLFA" führt, rechnet der Code; das Modell
 * braucht die Koordinaten dafür nicht.
 */
function overviewItem(item: FirecallItem): AiContextItem {
  const { lat, lng, fieldData, ...rest } = projectFirecallItem(item);
  return rest;
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
  memory,
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
  /** Notizen und voriges Gespräch dieses Geräts, siehe `assistantMemory`. */
  memory?: AssistantMemory;
}): AiContext {
  const center = map ? map.getCenter() : defaultPosition;
  const bounds = map ? map.getBounds() : null;

  const live = existingItems.filter((i) => !i.deleted);
  const messebenen = new Set(
    layers.filter((l) => !l.deleted && isMeasurementLayer(l)).map((l) => l.id),
  );
  const istMesspunkt = (item: FirecallItem) =>
    !!item.layer && messebenen.has(item.layer);

  const itemCounts: Record<string, number> = {};
  for (const item of live) {
    itemCounts[item.type] = (itemCounts[item.type] ?? 0) + 1;
  }

  // Der Überblick: alles, was man beim Namen nennt. Messpunkte und das
  // Tagebuch wachsen im Einsatz unbegrenzt und stehen deshalb nicht darin —
  // Details holt das Modell mit `findItems`.
  const contextItems: AiContextItem[] = live
    .filter((i) => !ENTRY_TYPES.has(i.type) && !istMesspunkt(i))
    .map(overviewItem);

  const latestDiary: AiContextItem[] = live
    .filter((i) => i.type === 'diary')
    .sort((a, b) => itemTime(b) - itemTime(a))
    .slice(0, LATEST_DIARY)
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
    itemCounts,
    latestDiary,
    userPosition: isPositionSet ? { lat: position.lat, lng: position.lng } : null,
    recentInteractions: interactions,
    // Nur mit Trupps: Der Kontext geht bei jedem Zug hinaus und soll dort,
    // wo kein Atemschutz läuft, nicht wachsen.
    ...(trupps && trupps.length > 0 ? { atemschutzTrupps: trupps } : {}),
    ...ebenenKontext(layers, activeLayerId, live),
    ...gedaechtnisKontext(memory),
  };
}
