import type { PointExpression } from 'leaflet';

/** Punkt in Container-Pixeln der Karte. */
export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Nur die beiden Icon-Angaben, aus denen das Drehzentrum folgt. Nicht
 * `IconOptions` aus Leaflet: das verlangt ein `iconUrl` und wäre in Tests und
 * für `divIcon` nur Ballast. Ein echtes `IconOptions` passt strukturell hier
 * hinein.
 */
export interface PivotIconOptions {
  iconSize?: PointExpression;
  iconAnchor?: PointExpression;
}

function toPixelPoint(
  value: PointExpression | undefined,
  fallback: PixelPoint
): PixelPoint {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number') return { x: value, y: value };
  if (Array.isArray(value)) return { x: value[0], y: value[1] };
  return { x: value.x, y: value.y };
}

/**
 * Die Drehung steht als String im Firestore-Dokument und kommt aus einem
 * Zahlenfeld des Dialogs — leer, negativ oder über 360 ist alles möglich.
 */
export function normalizeRotation(
  value: string | number | undefined | null
): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return 0;
  return ((parsed % 360) + 360) % 360;
}

/**
 * Versatz des Drehzentrums gegenüber dem Marker-Punkt, in Pixeln.
 *
 * Leaflet setzt die linke obere Ecke des Icons auf `markerPunkt - iconAnchor`,
 * `leaflet-rotatedmarker` dreht mit `rotationOrigin: 'center'` um die
 * Icon-Mitte. Das Drehzentrum liegt damit bei `iconSize / 2 - iconAnchor`:
 * beim Fahrzeug (45x20, Anker [20, 0]) 2,5 px rechts und 10 px unter der
 * Position, beim Rohr (24x24, Anker mittig) genau darauf. Ohne diesen Versatz
 * sitzt der Griff beim Fahrzeug schief und wandert beim Drehen sichtbar aus.
 */
export function rotationPivotOffset(options: PivotIconOptions): PixelPoint {
  const size = toPixelPoint(options.iconSize, { x: 0, y: 0 });
  const anchor = toPixelPoint(options.iconAnchor, {
    x: size.x / 2,
    y: size.y / 2,
  });
  return { x: size.x / 2 - anchor.x, y: size.y / 2 - anchor.y };
}

/**
 * Winkel in Grad (0–359), auf den das Element zu drehen ist, damit der Griff
 * zum Zeiger schaut. Der Griff steht bei 0° senkrecht nach oben, gezählt wird
 * im Uhrzeigersinn — deshalb `atan2(dx, -dy)`.
 *
 * `snapDegrees` rastet auf das nächste Vielfache; ohne Angabe bleibt es
 * gradgenau.
 */
export function angleFromPointer(
  pivot: PixelPoint,
  pointer: PixelPoint,
  snapDegrees?: number
): number {
  const dx = pointer.x - pivot.x;
  const dy = pointer.y - pivot.y;
  if (dx === 0 && dy === 0) return 0;

  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const normalized = ((degrees % 360) + 360) % 360;
  if (!snapDegrees || snapDegrees <= 0) return normalized;
  return (Math.round(normalized / snapDegrees) * snapDegrees) % 360;
}
