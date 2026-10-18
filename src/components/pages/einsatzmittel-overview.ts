import { FirecallItem, FirecallLocation } from '../firebase/firestore';
import { currentLocationId } from './location-assignment';
import { parentMap, TreeItem } from './unit-tree';

/**
 * Eine Zeile der Übersicht: Einsatzmittel, darunter was an ihm hängt — an
 * einer Bereitschaft die Züge, an einem Zug die Fahrzeuge.
 */
export interface OverviewEntry {
  item: FirecallItem;
  children: OverviewEntry[];
}

/** Die Einsatzmittel eines Einsatzorts — ohne `location` die nicht zugeordneten. */
export interface LocationGroup {
  location?: FirecallLocation;
  entries: OverviewEntry[];
}

function isAssignable(item: FirecallItem): boolean {
  return item.type === 'vehicle' || item.type === 'tacticalUnit';
}

/**
 * Gliedert die Einsatzmittel nach Einsatzort, je Einsatzort die taktischen
 * Einheiten mit allem, was unter ihnen hängt.
 *
 * Ein Fahrzeug oder eine Einheit steht unter ihrer Einheit, solange beide
 * am selben Einsatzort stehen. Wurde es einzeln woandershin geschickt, zeigt die
 * Übersicht es dort — sie soll beantworten, was wo steht, nicht wer zu wem
 * gehört. Einsatzorte ohne Einsatzmittel fallen weg, die nicht zugeordneten
 * stehen am Ende.
 */
export function groupByLocation(
  items: FirecallItem[],
  locations: FirecallLocation[],
): LocationGroup[] {
  const assignable = items.filter(isAssignable);
  const locationOf = new Map(
    assignable.map((i) => [i.id, currentLocationId(locations, i)]),
  );
  const parents = parentMap(assignable as TreeItem[]);
  const parentOf = (item: FirecallItem): string | undefined => {
    const parentId = item.id ? parents.get(item.id) : undefined;
    if (!parentId) return undefined;
    return locationOf.get(parentId) === locationOf.get(item.id)
      ? parentId
      : undefined;
  };

  const entriesFor = (locationId: string): OverviewEntry[] => {
    const here = assignable.filter((i) => locationOf.get(i.id) === locationId);
    const entry = (item: FirecallItem): OverviewEntry => ({
      item,
      children: here.filter((c) => c.id && parentOf(c) === item.id).map(entry),
    });
    return here.filter((i) => !parentOf(i)).map(entry);
  };

  const groups: LocationGroup[] = locations
    .filter((l) => l.id)
    .map((location) => ({ location, entries: entriesFor(location.id!) }));
  groups.push({ entries: entriesFor('') });
  return groups.filter((g) => g.entries.length > 0);
}

export type DeploymentStatus = 'alerted' | 'arrived' | 'departed';

/** Wie weit ein Einsatzmittel ist — der späteste erfasste Zeitpunkt zählt. */
export function deploymentStatus(item: {
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
}): DeploymentStatus | undefined {
  if (item.abruecken) return 'departed';
  if (item.eintreffen) return 'arrived';
  if (item.alarmierung) return 'alerted';
  return undefined;
}
