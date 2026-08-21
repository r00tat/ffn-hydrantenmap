import { geohashQueryBounds } from 'geofire-common';

/**
 * Geohash-Grenzen für eine Umkreissuche in `clusters6`.
 *
 * Reine Zeichenketten, kein Firestore — damit auch ohne initialisiertes
 * Firebase testbar.
 *
 * **Warum das nicht `geohashQueryBounds` allein kann.** Die Bibliothek wählt die
 * Genauigkeit der Grenzen nach dem Radius: je kleiner der Kreis, desto länger
 * die Präfixe. Unter etwa 500 m sind sie **sieben** Zeichen lang — die
 * Dokumente in `clusters6` tragen aber immer einen **sechsstelligen** Geohash.
 * Und `'u2ebz1' < 'u2ebz1n'`: Die Kachel, in der man selbst steht, liegt
 * lexikografisch vor der Untergrenze ihres eigenen Bereichs und fällt aus der
 * Abfrage heraus. Eine Suche mit kleinem Radius fand deshalb **nichts**, nicht
 * etwa zu wenig.
 *
 * Gekürzt wird auf sechs Zeichen. Das vergrößert den abgefragten Bereich, und
 * das ist die richtige Richtung: Die Grenzen decken ohnehin mehr ab als den
 * Radius, auf Distanz filtert der Aufrufer.
 */

/** Länge des Geohash in den Dokumenten der Sammlung `clusters6`. */
export const CLUSTER_GEOHASH_PRECISION = 6;

export function clusterQueryBounds(
  center: { lat: number; lng: number },
  radiusInM: number
): [string, string][] {
  const bounds = geohashQueryBounds(
    [center.lat, center.lng],
    radiusInM
  ) as [string, string][];

  const seen = new Set<string>();
  const clamped: [string, string][] = [];

  for (const [lo, hi] of bounds) {
    const range: [string, string] = [
      lo.slice(0, CLUSTER_GEOHASH_PRECISION),
      hi.slice(0, CLUSTER_GEOHASH_PRECISION),
    ];
    // Nach dem Kürzen fallen mehrere der feinen Bereiche auf dieselbe Kachel
    // zusammen. Ohne das Aussortieren wären es vier gleiche Abfragen.
    const key = `${range[0]}:${range[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clamped.push(range);
  }

  return clamped;
}
