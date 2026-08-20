'use server';

import { actionUserAuthorizedForFirecall } from '../../../../app/auth';
import type { LatLngPosition } from '../../../../common/geo';
import { computeRouteLegsGeometry } from '../../../actions/maps/routes';
import {
  MAX_ROUTING_POINTS,
  routingProfile,
  stitchRoutedPositions,
} from './routedPath';

function isValidPosition(position: unknown): position is LatLngPosition {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    typeof position[0] === 'number' &&
    typeof position[1] === 'number' &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 90 &&
    Math.abs(position[1]) <= 180
  );
}

/**
 * Der Straßenverlauf einer Leitung über die übergebenen Punkte, oder
 * `undefined`, wenn das Routing nicht zu bekommen ist.
 *
 * Gibt nur die Geometrie zurück, keine Länge: Die rechnet der Client mit
 * derselben Funktion aus, die auch die Luftlinie misst
 * (`calculateDistance`). Damit ist die angezeigte Länge immer die der
 * gezeichneten Linie — und Leaflet, das dahinter steckt, bleibt aus dem
 * Server-Bundle heraus.
 */
export async function computeStreetRoutedPositions(
  firecallId: string,
  positions: LatLngPosition[],
  profile?: string
): Promise<LatLngPosition[] | undefined> {
  await actionUserAuthorizedForFirecall(firecallId, { requireWrite: true });

  if (
    !Array.isArray(positions) ||
    positions.length < 2 ||
    !positions.every(isValidPosition)
  ) {
    console.error('computeStreetRoutedPositions: ungültige Punkte', positions);
    return undefined;
  }

  if (positions.length > MAX_ROUTING_POINTS) {
    console.error(
      `computeStreetRoutedPositions: ${positions.length} Punkte überschreiten das Limit von ${MAX_ROUTING_POINTS}`
    );
    return undefined;
  }

  const legs = await computeRouteLegsGeometry(
    positions.map(([lat, lng]) => ({ lat, lng })),
    // Alles Unbekannte gilt als Fuß — das Feld kommt aus dem Browser.
    routingProfile(profile) === 'drive' ? 'DRIVE' : 'WALK'
  );
  if (!legs) {
    return undefined;
  }

  return stitchRoutedPositions(positions, legs);
}
