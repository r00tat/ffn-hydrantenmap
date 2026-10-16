import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import { positionAtLocation } from '../pages/location-assignment';
import { getLocationDisplayName } from './locationDiary';

/**
 * Ebene je Einsatzort — eingeschaltet am Einsatz (`locationLayers`), siehe
 * docs/einsatzort-ebenen.md. Hier steht nur die Logik ohne Firestore; das
 * Schreiben übernimmt `useLocationLayers`.
 */

/** Die Ebene trägt den Namen des Einsatzorts, wie im Einsatztagebuch. */
export function locationLayerName(location: Partial<FirecallLocation>): string {
  return getLocationDisplayName(location);
}

/**
 * Die Ebene, in die Elemente dieses Einsatzorts gehören — leer, wenn erst eine
 * angelegt werden muss.
 *
 * `pendingLayerId` ist eine Ebene, die dieses Gerät gerade angelegt hat und die
 * weder am Einsatzort noch in der Liste der Ebenen angekommen ist. Ohne sie
 * legten zwei schnelle Zuordnungen zum selben Einsatzort zwei Ebenen an. Trägt
 * der Einsatzort sie schon, zählt nur noch, ob es die Ebene noch gibt.
 */
export function resolveLocationLayer(
  location: FirecallLocation,
  activeLayerIds: ReadonlySet<string>,
  pendingLayerId?: string,
): string | undefined {
  if (location.layer && activeLayerIds.has(location.layer)) {
    return location.layer;
  }
  if (pendingLayerId && location.layer !== pendingLayerId) {
    return pendingLayerId;
  }
  return undefined;
}

/**
 * Das Element am Einsatzort: auf dessen Koordinaten versetzt und — mit
 * `layerId` — in dessen Ebene gelegt. Leer, wenn sich nichts ändert.
 */
export function placeAtLocation<T extends FirecallItem>(
  item: T,
  location: FirecallLocation,
  layerId?: string,
): T | undefined {
  let next = positionAtLocation(item, location) ?? item;
  if (layerId && next.layer !== layerId) {
    next = { ...next, layer: layerId };
  }
  return next === item ? undefined : next;
}

/**
 * Das Element zurück auf die Standard-Ebene „Einsatz" — nur, wenn es noch in
 * der Ebene dieses Einsatzorts liegt. Wer es von Hand in eine andere Ebene
 * gezogen hat, wollte es dort haben.
 */
export function releaseFromLocationLayer<T extends FirecallItem>(
  item: T,
  location: FirecallLocation,
): T | undefined {
  if (!location.layer || item.layer !== location.layer) return undefined;
  return { ...item, layer: undefined };
}

/**
 * Die Einsatzorte, die eine Kartenschicht zeigt: mit `layerId` die dieser
 * Ebene, ohne die übrigen — auch die, deren Ebene gelöscht wurde, damit kein
 * Einsatzort von der Karte verschwindet.
 */
export function locationsForLayer(
  locations: FirecallLocation[],
  layerId: string | undefined,
  activeLayerIds: ReadonlySet<string>,
): FirecallLocation[] {
  return locations.filter((loc) =>
    layerId
      ? loc.layer === layerId
      : !loc.layer || !activeLayerIds.has(loc.layer),
  );
}
