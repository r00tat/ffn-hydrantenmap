import type { LatLngExpression } from 'leaflet';
import {
  angleFromPointer,
  PivotIconOptions,
  PixelPoint,
  rotationPivotOffset,
} from './rotationGeometry';

/**
 * Nur der Teil der Leaflet-Karte, den das Ziehen braucht. Als eigenes Interface,
 * damit der Test eine Karte aus drei Funktionen stellen kann.
 */
export interface RotationDragMap {
  latLngToContainerPoint: (latlng: LatLngExpression) => PixelPoint;
  mouseEventToContainerPoint: (event: MouseEvent) => PixelPoint;
  dragging?: { enable: () => void; disable: () => void };
}

export interface RotationDragOptions {
  map: RotationDragMap;
  position: LatLngExpression;
  /** Icon-Optionen des gedrehten Elements, für den Pivot-Versatz. */
  iconOptions: PivotIconOptions;
  /** Rasterung in Grad, solange Shift gedrückt ist. */
  snapDegrees: number;
  onPreview: (degrees: number) => void;
  onCommit: (degrees: number) => void;
}

/**
 * Hängt das Drehen an den Griff-Knopf und gibt die Aufräumfunktion zurück.
 *
 * Die Optionen kommen über eine Funktion herein, damit sich Position und Icon
 * ändern dürfen, ohne die Listener neu hängen zu müssen.
 */
export function attachRotationDrag(
  knob: HTMLElement,
  getOptions: () => RotationDragOptions
): () => void {
  let active = false;

  const angleAt = (event: PointerEvent) => {
    const { map, position, iconOptions, snapDegrees } = getOptions();
    const offset = rotationPivotOffset(iconOptions);
    const markerPoint = map.latLngToContainerPoint(position);
    const pivot = {
      x: markerPoint.x + offset.x,
      y: markerPoint.y + offset.y,
    };
    return angleFromPointer(
      pivot,
      map.mouseEventToContainerPoint(event),
      event.shiftKey ? snapDegrees : undefined
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    // Sonst landet der Klick zusätzlich auf der Karte und hebt die Auswahl auf.
    event.stopPropagation();
    active = true;
    knob.setPointerCapture?.(event.pointerId);
    getOptions().map.dragging?.disable();
    getOptions().onPreview(angleAt(event));
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active) return;
    event.preventDefault();
    getOptions().onPreview(angleAt(event));
  };

  const finish = (event: PointerEvent, commit: boolean) => {
    if (!active) return;
    active = false;
    knob.releasePointerCapture?.(event.pointerId);
    getOptions().map.dragging?.enable();
    if (commit) getOptions().onCommit(angleAt(event));
  };

  const onPointerUp = (event: PointerEvent) => finish(event, true);
  const onPointerCancel = (event: PointerEvent) => finish(event, false);

  knob.addEventListener('pointerdown', onPointerDown);
  knob.addEventListener('pointermove', onPointerMove);
  knob.addEventListener('pointerup', onPointerUp);
  knob.addEventListener('pointercancel', onPointerCancel);

  return () => {
    knob.removeEventListener('pointerdown', onPointerDown);
    knob.removeEventListener('pointermove', onPointerMove);
    knob.removeEventListener('pointerup', onPointerUp);
    knob.removeEventListener('pointercancel', onPointerCancel);
    if (active) {
      // Abgeräumt mitten im Zug: die Karte darf nicht gelähmt zurückbleiben.
      active = false;
      getOptions().map.dragging?.enable();
    }
  };
}
