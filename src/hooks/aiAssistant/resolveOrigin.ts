import { GeoPosition } from '../../common/geo';
import { searchPlace } from '../../components/actions/maps/places';
import { FirecallItem } from '../../components/firebase/firestore';
import { findFirecallItemByName } from './itemLookup';
import { ResolvedOrigin } from './types';

/**
 * Eine Positionsangabe des Modells auflösen und dabei benennen, worauf sie
 * tatsächlich hinauslief.
 *
 * Die Bezeichnung ist kein Beiwerk: Fällt eine Angabe auf den Rückfall
 * zurück, weil weder Standort noch Einsatzort gesetzt sind, muss die Antwort
 * das sagen — sonst wundert man sich, warum die Leitungen irgendwo im
 * Nirgendwo beginnen.
 *
 * Ohne React und ohne Leaflet, weil es zwei Aufrufer gibt: den
 * Browser-Assistenten (dort ist der Rückfall die Kartenmitte und es gibt eine
 * Benutzerposition) und den MCP-Server (dort gibt es beides nicht, der
 * Rückfall ist der Einsatzort).
 */

export interface OriginContext {
  /** Was gilt, wenn nichts Besseres da ist. */
  fallback: ResolvedOrigin;
  /** Der eigene Standort — im MCP-Server gibt es ihn nicht. */
  userPosition?: ResolvedOrigin;
  /** Der Einsatzort, sofern am Einsatz gesetzt. */
  einsatzort?: ResolvedOrigin;
  /** Elemente des Einsatzes, für `atItem`/`nearItem`. */
  existingItems: FirecallItem[];
}

export interface PositionSpec {
  type: string;
  itemName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** Seite, auf die `nearItem` setzt — links, rechts, oberhalb, unterhalb. */
  direction?: string;
  /** Abstand zum Bezugselement in Metern, nur für `nearItem`. */
  distance?: number;
  /**
   * Element, das nicht als Bezug taugt: das verschobene selbst. Sonst findet
   * „neben das TLF" beim Verschieben eines TLF das Fahrzeug selbst.
   */
  excludeItemId?: string;
}

/** Abstand für `nearItem` ohne Angabe, in Metern. */
const NEAR_ITEM_DISTANCE = 20;
const METERS_PER_DEGREE = 111320;

/**
 * Versatz in Grad je Richtung. Die Karte ist genordet, links ist also
 * Westen — so, wie der Benutzer die Karte vor sich sieht.
 */
const DIRECTION_VECTORS: Record<string, { north: number; east: number }> = {
  left: { north: 0, east: -1 },
  right: { north: 0, east: 1 },
  above: { north: 1, east: 0 },
  below: { north: -1, east: 0 },
};

/** Für die Antwort: „links neben", „oberhalb von". */
export const DIRECTION_LABELS: Record<string, string> = {
  left: 'links neben',
  right: 'rechts neben',
  above: 'oberhalb von',
  below: 'unterhalb von',
};

function nearItemOffset(
  lat: number,
  direction: string | undefined,
  distance: number | undefined,
): { lat: number; lng: number } {
  const meters =
    distance && distance > 0 ? distance : NEAR_ITEM_DISTANCE;
  // Ohne Richtung schräg nach rechts oben, wie bisher.
  const vector = (direction && DIRECTION_VECTORS[direction]) || {
    north: Math.SQRT1_2,
    east: Math.SQRT1_2,
  };
  return {
    lat: (vector.north * meters) / METERS_PER_DEGREE,
    lng:
      (vector.east * meters) /
      (METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180)),
  };
}

export async function resolveOriginFrom(
  positionSpec: PositionSpec | undefined,
  { fallback, userPosition, einsatzort, existingItems }: OriginContext,
): Promise<ResolvedOrigin> {
  if (!positionSpec) return fallback;

  switch (positionSpec.type) {
    case 'mapCenter':
      return fallback;

    case 'auto':
      // Wer im Einsatz nach dem nächsten Hydranten fragt, meint fast immer
      // „von hier aus". Der Einsatzort ist die Näherung, wenn kein GPS steht;
      // der Rückfall erst, wenn auch der fehlt.
      return userPosition ?? einsatzort ?? fallback;

    case 'userPosition':
      return userPosition ?? einsatzort ?? fallback;

    case 'einsatzort':
      // Ein Einsatz ohne gesetzten Einsatzort ist in den ersten Minuten der
      // Normalfall.
      return einsatzort ?? userPosition ?? fallback;

    case 'atItem':
    case 'nearItem': {
      const target = findFirecallItemByName(
        existingItems.filter((i) => i.id !== positionSpec.excludeItemId),
        positionSpec.itemName,
      );
      if (target?.lat && target?.lng) {
        // `nearItem` setzt daneben (zum Platzieren neuer Elemente), `atItem`
        // genau darauf (als Bezugspunkt einer Messung).
        const offset =
          positionSpec.type === 'nearItem'
            ? nearItemOffset(
                target.lat,
                positionSpec.direction,
                positionSpec.distance,
              )
            : { lat: 0, lng: 0 };
        return {
          lat: target.lat + offset.lat,
          lng: target.lng + offset.lng,
          type: positionSpec.type,
          label: `"${target.name}"`,
        };
      }
      return fallback;
    }

    case 'address':
      if (positionSpec.address) {
        const results = await searchPlace(positionSpec.address, {
          position: new GeoPosition(fallback.lat, fallback.lng),
          maxResults: 1,
        });
        if (results[0]) {
          return {
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
            type: 'address',
            label: `"${positionSpec.address}"`,
          };
        }
      }
      return fallback;

    case 'coordinates':
      if (positionSpec.lat !== undefined && positionSpec.lng !== undefined) {
        return {
          lat: positionSpec.lat,
          lng: positionSpec.lng,
          type: 'coordinates',
          label: 'den angegebenen Koordinaten',
        };
      }
      return fallback;

    default:
      return fallback;
  }
}
