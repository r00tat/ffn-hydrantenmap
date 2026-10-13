import { FirecallLocation } from '../firebase/firestore';

interface AssignableItem {
  id?: string;
  name: string;
}

/** Anzeigename eines Einsatzorts: Name, sonst Adresse. */
export function locationLabel(location: FirecallLocation): string {
  return (
    location.name ||
    `${location.street || ''} ${location.number || ''}`.trim() ||
    'Einsatzort'
  );
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
  return Object.entries(location.vehicles || {}).some(
    ([key, name]) => matches(key, name, item),
  );
}

function matches(key: string, name: string, item: AssignableItem): boolean {
  return (!!item.id && key === item.id) || (key === name && name === item.name);
}

/**
 * Die Änderungen an den Einsatzorten, damit das Element genau an den
 * gewählten steht. Ein Element darf an mehreren Einsatzorten stehen — wie im
 * Dialog des Einsatzorts. Zurückgegeben werden nur Einsatzorte, an denen sich
 * etwas ändert, jeweils mit dem vollständigen neuen `vehicles`.
 */
export function locationUpdatesForItem(
  locations: FirecallLocation[],
  item: AssignableItem,
  selectedIds: string[],
): { id: string; vehicles: Record<string, string> }[] {
  if (!item.id) return [];
  const selected = new Set(selectedIds);
  const updates: { id: string; vehicles: Record<string, string> }[] = [];
  for (const location of locations) {
    if (!location.id) continue;
    const assigned = isAssignedToLocation(location, item);
    const wanted = selected.has(location.id);
    if (assigned === wanted) continue;
    const vehicles = Object.fromEntries(
      Object.entries(location.vehicles || {}).filter(
        ([key, name]) => !matches(key, name, item),
      ),
    );
    if (wanted) vehicles[item.id] = item.name;
    updates.push({ id: location.id, vehicles });
  }
  return updates;
}
