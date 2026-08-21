'use client';

import { latLngPosition, type LatLngPosition } from '../../../../../common/geo';
import { toLatLng } from '../../../../../hooks/leafletFunctions';

/**
 * Abtastung einer Leitung für das Höhenprofil.
 *
 * Braucht Leaflet für die Streckenmessung und gehört damit auf die Client-Seite
 * — die Server-Action bekommt nur die fertigen Koordinaten.
 */

/**
 * Punkte je Anfrage. 100 ist die Grenze, die OpenTopoData annimmt; damit kostet
 * eine Änderung an der Leitung genau **eine** Anfrage, ohne Stückelung und ohne
 * Wartezeit zwischen Teilanfragen.
 */
export const MAX_ELEVATION_SAMPLES = 100;

/** Angestrebter Abstand der Abtastpunkte in m. */
export const TARGET_SAMPLE_SPACING_M = 50;

export interface ElevationSample {
  position: LatLngPosition;
  /** Streckenmeter ab dem Anfang der Linie. */
  distance: number;
}

/** Lineare Interpolation zwischen zwei Punkten. Auf 50 m ist das exakt genug. */
const between = (
  from: LatLngPosition,
  to: LatLngPosition,
  ratio: number
): LatLngPosition => [
  from[0] + (to[0] - from[0]) * ratio,
  from[1] + (to[1] - from[1]) * ratio,
];

/**
 * Gleichabständige Abtastpunkte auf der Polylinie, Anfang und Ende immer dabei.
 *
 * Über 5 km wächst der Abstand über die angestrebten 50 m hinaus, weil der
 * Deckel bei `MAX_ELEVATION_SAMPLES` liegt (10 km ⇒ 100 m). Das ist die
 * richtige Seite des Kompromisses: Eine Zubringleitung über 10 km ist ohnehin
 * außergewöhnlich, und eine Kuppe, die auf 100 m nicht auffällt, verschiebt
 * einen Pumpenstandort um weniger als eine B-Länge.
 */
export function sampleAlongPath(
  positions: LatLngPosition[]
): ElevationSample[] {
  const points = positions.filter(
    ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
  );
  if (points.length < 2) {
    return points.map((position) => ({ position, distance: 0 }));
  }

  // Kumulierte Streckenmeter je Stützpunkt — die Grundlage für „gleichabständig
  // auf der Linie" statt „gleichabständig zwischen den Stützpunkten".
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const segment = toLatLng(points[i][0], points[i][1]).distanceTo(
      toLatLng(points[i - 1][0], points[i - 1][1])
    );
    cumulative.push(cumulative[i - 1] + segment);
  }
  const length = cumulative[cumulative.length - 1];

  if (length <= 0) {
    return [
      { position: points[0], distance: 0 },
      { position: points[points.length - 1], distance: 0 },
    ];
  }

  const count = Math.min(
    MAX_ELEVATION_SAMPLES,
    Math.max(2, Math.round(length / TARGET_SAMPLE_SPACING_M) + 1)
  );
  const step = length / (count - 1);

  const samples: ElevationSample[] = [];
  let segment = 1;
  for (let i = 0; i < count; i += 1) {
    const distance = i === count - 1 ? length : i * step;
    while (segment < points.length - 1 && cumulative[segment] < distance) {
      segment += 1;
    }
    const spanStart = cumulative[segment - 1];
    const span = cumulative[segment] - spanStart;
    const ratio = span > 0 ? (distance - spanStart) / span : 0;
    samples.push({
      position: between(points[segment - 1], points[segment], ratio),
      distance,
    });
  }

  // Anfang und Ende bleiben die gesetzten Punkte: Die Entnahmestelle und der
  // Verteiler sind die Stellen, deren Höhe zählt — dort darf keine Interpolation
  // dazwischenkommen.
  samples[0].position = latLngPosition(points[0][0], points[0][1]);
  samples[samples.length - 1].position = latLngPosition(
    points[points.length - 1][0],
    points[points.length - 1][1]
  );

  return samples;
}
