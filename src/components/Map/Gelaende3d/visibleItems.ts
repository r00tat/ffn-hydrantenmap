import type { FirecallLayers } from '../../../hooks/useFirecallLayers';
import type { FirecallItem } from '../../firebase/firestore';

/**
 * Welche Einsatzobjekte die 3D-Ansicht zeigt.
 *
 * Die Ansicht ist ein Blick auf **dieselbe** Lage wie die Karte, nicht auf den
 * ganzen Datenbestand. Wer eine Ebene ausblendet, hat sie ausgeblendet — sie in
 * 3D trotzdem zu zeigen, wäre ein zweites, abweichendes Lagebild, und das ist
 * genau das, was im Einsatz nicht passieren darf.
 *
 * Die Sichtbarkeit steckt in Leaflets Layer-Steuerung, nicht in React: sie ist
 * nur über die Ereignisse `overlayadd`/`overlayremove` zu erfahren. Die melden
 * aber ausschließlich **Änderungen**. Für alles, worüber noch keine Meldung
 * kam, gilt deshalb dieselbe Vorbelegung wie in `FirecallLayer.tsx`.
 */

/** Die Überlagerung mit den Objekten ohne eigene Ebene. */
export const BASE_OVERLAY_NAME = 'Einsatz';

/** Der Name, unter dem eine Ebene in der Layer-Steuerung steht. */
export const layerOverlayName = (name: string): string => `Einsatz ${name}`;

/** Zustände, die aus `overlayadd`/`overlayremove` bekannt sind. */
export type OverlayStates = Readonly<Record<string, boolean>>;

/**
 * Ob eine Überlagerung sichtbar ist.
 *
 * Ohne Meldung gilt die Vorbelegung: Ebenen sind angehakt, sofern nicht
 * `defaultVisible === 'false'` am Datensatz steht.
 */
export function isOverlayVisible(
  name: string,
  overlays: OverlayStates,
  fallback: boolean
): boolean {
  const known = overlays[name];
  return known === undefined ? fallback : known;
}

/**
 * Ob ein Objekt in der Karte gerade sichtbar ist.
 *
 * Ein Objekt ohne Ebene — und eines, dessen Ebene es nicht mehr gibt — hängt an
 * der Überlagerung „Einsatz"; dieselbe Regel wie in `FirecallItemsLayer.tsx`,
 * wo verwaiste Objekte ebenfalls dorthin fallen.
 */
export function isItemVisible(
  item: FirecallItem,
  layers: FirecallLayers,
  overlays: OverlayStates
): boolean {
  const layer = item.layer ? layers[item.layer] : undefined;
  if (!layer) return isOverlayVisible(BASE_OVERLAY_NAME, overlays, true);
  return isOverlayVisible(
    layerOverlayName(layer.name),
    overlays,
    layer.defaultVisible !== 'false'
  );
}

/** Die Objekte, die die Karte gerade zeigt. */
export function visibleItems(
  items: FirecallItem[],
  layers: FirecallLayers,
  overlays: OverlayStates
): FirecallItem[] {
  return items.filter((item) => isItemVisible(item, layers, overlays));
}
