/**
 * Die Punkte, mit denen das Zeichnen nach einem Klick auf den gesetzten Punkt
 * `index` endet — oder `undefined`, wenn der Klick das Zeichnen nicht beendet.
 *
 * Beendet wird mit dem letzten **und** dem ersten Punkt. Der erste schließt
 * eine Linie zum Ring, weil sie dort endet, wo hingeklickt wurde — etwa eine
 * Absperrung rundherum. Eine Fläche ist ohnehin geschlossen und bekommt keinen
 * Doppelpunkt. Am ersten Punkt erst ab drei Punkten: Bei zweien ergäbe der Ring
 * nur ein Hin und Zurück und die Fläche keine Fläche.
 */
export function finishedPositions<T>(
  positions: T[],
  index: number,
  closeRing: boolean
): T[] | undefined {
  if (index === positions.length - 1) {
    return [...positions];
  }
  if (index === 0 && positions.length >= 3) {
    return closeRing ? [...positions, positions[0]] : [...positions];
  }
  return undefined;
}
