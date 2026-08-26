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
}

/** Versatz für `nearItem`: rund 20 m in Grad. */
const NEAR_ITEM_OFFSET = 20 / 111320;

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
        existingItems,
        positionSpec.itemName,
      );
      if (target?.lat && target?.lng) {
        // `nearItem` setzt daneben (zum Platzieren neuer Elemente), `atItem`
        // genau darauf (als Bezugspunkt einer Messung).
        const offset =
          positionSpec.type === 'nearItem' ? NEAR_ITEM_OFFSET : 0;
        return {
          lat: target.lat + offset,
          lng: target.lng + offset,
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
