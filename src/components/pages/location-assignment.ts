import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import { getLocationDisplayName } from '../Einsatzorte/locationDiary';

export interface AssignableItem {
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

interface UnitItem extends AssignableItem {
  type?: string;
  tacticalUnitId?: string;
}

/**
 * Das Element samt allem, was mit ihm zieht: An einer taktischen Einheit
 * hängen ihre Fahrzeuge (`tacticalUnitId`), ein Fahrzeug steht für sich.
 */
export function unitWithVehicles<T extends UnitItem>(item: T, items: T[]): T[] {
  if (item.type !== 'tacticalUnit' || !item.id) return [item];
  return [
    item,
    ...items.filter(
      (i) => i.type === 'vehicle' && i.tacticalUnitId === item.id,
    ),
  ];
}

/**
 * Wie `moveItemToLocation`, für mehrere Elemente auf einmal — eine Einheit
 * mit ihren Fahrzeugen. Je Einsatzort entsteht genau eine Änderung, sonst
 * überschriebe die zweite Schreiboperation die erste.
 */
export function moveItemsToLocation(
  locations: FirecallLocation[],
  items: AssignableItem[],
  targetId: string,
): LocationMove {
  let current = locations;
  const changed = new Map<string, Record<string, string>>();
  const removedFrom = new Map<string, FirecallLocation>();
  let assignedTo: FirecallLocation | undefined;

  for (const item of items) {
    const move = moveItemToLocation(current, item, targetId);
    for (const update of move.updates) changed.set(update.id, update.vehicles);
    for (const location of move.removedFrom) {
      if (location.id) removedFrom.set(location.id, location);
    }
    assignedTo = assignedTo ?? move.assignedTo;
    current = current.map((l) =>
      l.id && changed.has(l.id) ? { ...l, vehicles: changed.get(l.id)! } : l,
    );
  }

  return {
    updates: [...changed].map(([id, vehicles]) => ({ id, vehicles })),
    removedFrom: [...removedFrom.values()],
    assignedTo: assignedTo
      ? locations.find((l) => l.id === assignedTo?.id)
      : undefined,
  };
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

/**
 * Das Element auf die Koordinaten des Einsatzorts versetzt — so steht es auf
 * der Karte dort, wo es eingesetzt ist. Leer, wenn der Einsatzort keine
 * Koordinaten hat oder das Element schon dort steht.
 */
export function positionAtLocation<T extends FirecallItem>(
  item: T,
  location: FirecallLocation,
): T | undefined {
  const { lat, lng } = location;
  if (lat === undefined || lng === undefined) return undefined;
  if (item.lat === lat && item.lng === lng) return undefined;
  return { ...item, lat, lng };
}
