import { FirecallItem } from '../../components/firebase/firestore';
import { AiContext, AiContextItem, AiInteraction } from './types';

export function buildAiContext({
  map,
  defaultPosition,
  existingItems,
  isPositionSet,
  position,
  interactions,
}: {
  map: { getCenter: () => { lat: number; lng: number }; getBounds: () => any; getZoom: () => number } | null;
  defaultPosition: { lat: number; lng: number };
  existingItems: FirecallItem[];
  isPositionSet: boolean;
  position: { lat: number; lng: number };
  interactions: AiInteraction[];
}): AiContext {
  const center = map ? map.getCenter() : defaultPosition;
  const bounds = map ? map.getBounds() : null;

  const contextItems: AiContextItem[] = existingItems
    .filter((i) => !i.deleted)
    .map((i) => {
      const base: AiContextItem = {
        id: i.id!,
        type: i.type,
        name: i.name,
        lat: i.lat,
        lng: i.lng,
      };

      switch (i.type) {
        case 'vehicle': {
          const v = i as any;
          if (v.fw) base.fw = v.fw;
          if (v.besatzung) base.besatzung = v.besatzung;
          if (v.ats) base.ats = v.ats;
          if (v.alarmierung) base.alarmierung = v.alarmierung;
          if (v.eintreffen) base.eintreffen = v.eintreffen;
          if (v.abruecken) base.abruecken = v.abruecken;
          break;
        }
        case 'rohr': {
          const r = i as any;
          if (r.art) base.art = r.art;
          if (r.durchfluss) base.durchfluss = r.durchfluss;
          break;
        }
        case 'diary': {
          const d = i as any;
          if (d.art) base.art = d.art;
          if (d.datum) base.datum = d.datum;
          if (d.von) base.von = d.von;
          if (d.an) base.an = d.an;
          if (d.nummer) base.nummer = d.nummer;
          break;
        }
        case 'gb': {
          const g = i as any;
          if (g.ausgehend !== undefined) base.ausgehend = g.ausgehend;
          if (g.datum) base.datum = g.datum;
          if (g.von) base.von = g.von;
          if (g.an) base.an = g.an;
          if (g.nummer) base.nummer = g.nummer;
          break;
        }
        case 'circle': {
          const c = i as any;
          if (c.radius) base.radius = c.radius;
          if (c.color) base.color = c.color;
          break;
        }
        default:
          if (i.beschreibung) base.beschreibung = i.beschreibung;
          if (i.datum) base.datum = i.datum;
      }

      return base;
    });

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
  };
}
