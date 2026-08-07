import { NON_CREATE_ITEMS } from '../../firebase/firestore';
import { fcItemClasses } from './index';

export type FirecallItemGroupKey =
  | 'tactical'
  | 'waterSupply'
  | 'drawing'
  | 'documentation'
  | 'organisation'
  | 'other';

export interface FirecallItemGroup {
  key: FirecallItemGroupKey;
  itemTypes: string[];
}

/**
 * Thematic grouping of the element types offered when adding a new item to the
 * map. The order of the groups and of the types within a group defines the
 * order they are presented in.
 *
 * `other` is the catch-all bucket and therefore intentionally has no explicit
 * members — see {@link groupItemTypes}.
 */
export const FIRECALL_ITEM_GROUPS: readonly {
  readonly key: FirecallItemGroupKey;
  readonly itemTypes: readonly string[];
}[] = [
  { key: 'tactical', itemTypes: ['vehicle', 'tacticalUnit', 'el', 'assp'] },
  { key: 'waterSupply', itemTypes: ['hydrant', 'connection', 'rohr'] },
  { key: 'drawing', itemTypes: ['marker', 'line', 'circle', 'area', 'drawing'] },
  { key: 'documentation', itemTypes: ['diary', 'gb', 'upload'] },
  { key: 'organisation', itemTypes: ['location', 'layer'] },
  { key: 'other', itemTypes: [] },
];

/**
 * Sort the given item types into their thematic groups. Types that are not
 * mentioned in {@link FIRECALL_ITEM_GROUPS} end up in the `other` group, so a
 * newly registered item class never silently disappears from the picker.
 * Groups without any members are omitted.
 */
export function groupItemTypes(itemTypes: string[]): FirecallItemGroup[] {
  const remaining = new Set(itemTypes);

  const groups: FirecallItemGroup[] = FIRECALL_ITEM_GROUPS.map(
    ({ key, itemTypes: groupTypes }) => {
      const members = groupTypes.filter((type) => remaining.delete(type));
      return { key, itemTypes: members };
    },
  );

  // whatever is left over was not assigned to any group
  const other = groups.find((g) => g.key === 'other');
  if (other) {
    other.itemTypes.push(...itemTypes.filter((type) => remaining.has(type)));
  }

  return groups.filter((g) => g.itemTypes.length > 0);
}

/**
 * All item types a user may create, sorted into thematic groups.
 *
 * `upload` has no entry in {@link fcItemClasses} — it is a pseudo type handled
 * directly by the item dialog — but it is creatable and therefore included.
 */
export function groupedCreatableItemTypes(): FirecallItemGroup[] {
  const creatable = [...Object.keys(fcItemClasses), 'upload'].filter(
    (key) => !NON_CREATE_ITEMS.includes(key),
  );
  return groupItemTypes([...new Set(creatable)]);
}
