import type { LatLngPosition } from '../../../../common/geo';
import type { RoutedLeg } from '../../../actions/maps/routes';

/**
 * Reine Geometrie, ohne Leaflet und ohne Firestore: Diese Datei wird sowohl von
 * der Server-Action (`streetRoutingAction.ts`) als auch vom Client gebraucht.
 * Ein Leaflet-Import auf Modulebene würde die Action beim Laden mit
 * `window is not defined` abbrechen.
 */

/**
 * Mehr Punkte routet niemand von Hand — eine so lange Leitung stammt aus der
 * GPS-Aufzeichnung und folgt der Straße schon. Die Grenze hält die Kosten im
 * Griff: Ab 25 Punkten wird je Block ein Routing-Aufruf fällig.
 *
 * Steht hier und nicht in der Server-Action: Eine `'use server'`-Datei darf nur
 * async-Funktionen exportieren.
 */
export const MAX_ROUTING_POINTS = 50;

const samePosition = (a: LatLngPosition, b: LatLngPosition) =>
  a[0] === b[0] && a[1] === b[1];

/**
 * Der zu zeichnende Verlauf: je Abschnitt die Zuführung vom gesetzten Punkt zur
 * Straße, der Straßenverlauf und die Zuführung zum nächsten Punkt.
 *
 * Die gesetzten Punkte bleiben Teil der Linie, auch wenn sie neben der Straße
 * liegen — eine Leitung führt durch den Verteiler, nicht an ihm vorbei. Google
 * setzt Start und Ziel eines Abschnitts auf die Straße; die Strecke von dort
 * zum tatsächlichen Punkt zählt für die Schlauchlängen mit.
 *
 * Ein Punktpaar ohne Abschnitt wird direkt verbunden. Damit bleibt eine
 * unvollständige Antwort eine Leitung — sie ist dort nur wieder Luftlinie.
 */
export function stitchRoutedPositions(
  points: LatLngPosition[],
  legs: RoutedLeg[]
): LatLngPosition[] {
  const path: LatLngPosition[] = [];
  const push = (position: LatLngPosition) => {
    const last = path[path.length - 1];
    if (!last || !samePosition(last, position)) {
      path.push(position);
    }
  };

  points.forEach((point, index) => {
    push(point);
    legs[index]?.positions.forEach(push);
  });

  return path;
}

/**
 * Erkennungszeichen der Punkte, aus denen eine gespeicherte Geometrie berechnet
 * wurde. Weicht es von den aktuellen Punkten ab, wird neu geroutet.
 *
 * Ohne Toleranz verglichen: Die Punkte stammen aus demselben Schreibvorgang wie
 * die Signatur, und eine Abweichung kostet nur einen Routing-Aufruf. Dieselbe
 * Überlegung wie beim Routen-Cache am Einsatz (`firecallRoute.ts`).
 */
export function positionsSignature(positions: LatLngPosition[]): string {
  return JSON.stringify(positions);
}
