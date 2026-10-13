import { FirecallLocation } from '../firebase/firestore';
import { getLocationDisplayName } from '../Einsatzorte/locationDiary';

interface AssignableItem {
  id?: string;
  name: string;
}

/** Anzeigename eines Einsatzorts — derselbe wie im Einsatztagebuch. */
export function locationLabel(location: FirecallLocation): string {
  return getLocationDisplayName(location);
}

/**
 * Steht das Element am Einsatzort? `vehicles` ist `Record<itemId, name>`;
 * alte Dokumente führen den Namen auch als Schlüssel (siehe
 * `migrateVehicles` in useFirecallLocations), die zählen über den Namen.
 */
export function isAssignedToLocation(
  location: FirecallLocation,
  item: AssignableItem,
): boolean {
  return Object.entries(location.vehicles || {}).some(([key, name]) =>
    matches(key, name, item),
  );
}

function matches(key: string, name: string, item: AssignableItem): boolean {
  return (!!item.id && key === item.id) || (key === name && name === item.name);
}

/** Der Einsatzort, an dem das Element steht — leer, wenn keiner. */
export function currentLocationId(
  locations: FirecallLocation[],
  item: AssignableItem,
): string {
  return locations.find((l) => isAssignedToLocation(l, item))?.id ?? '';
}

export interface LocationMove {
  /** Je betroffenem Einsatzort das vollständige neue `vehicles`. */
  updates: { id: string; vehicles: Record<string, string> }[];
  /** Einsatzorte, von denen das Element abgezogen wird. */
  removedFrom: FirecallLocation[];
  /** Der Einsatzort, dem es neu zugeordnet wird. */
  assignedTo?: FirecallLocation;
}

/**
 * Setzt das Element an genau einen Einsatzort — oder an keinen, wenn
 * `targetId` leer ist. Eine Einheit steht immer nur an einem Einsatzort: Wer
 * sie einem anderen zuordnet, zieht sie vom bisherigen ab. Steht sie aus
 * älteren Zuordnungen an mehreren, wird sie von allen anderen abgezogen.
 */
export function moveItemToLocation(
  locations: FirecallLocation[],
  item: AssignableItem,
  targetId: string,
): LocationMove {
  const move: LocationMove = { updates: [], removedFrom: [] };
  if (!item.id) return move;

  for (const location of locations) {
    if (!location.id || location.id === targetId) continue;
    if (!isAssignedToLocation(location, item)) continue;
    move.updates.push({
      id: location.id,
      vehicles: withoutItem(location.vehicles, item),
    });
    move.removedFrom.push(location);
  }

  const target = locations.find((l) => l.id === targetId);
  if (target?.id && !isAssignedToLocation(target, item)) {
    move.updates.push({
      id: target.id,
      vehicles: { ...withoutItem(target.vehicles, item), [item.id]: item.name },
    });
    move.assignedTo = target;
  }
  return move;
}

function withoutItem(
  vehicles: Record<string, string> | undefined,
  item: AssignableItem,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(vehicles || {}).filter(
      ([key, name]) => !matches(key, name, item),
    ),
  );
}
