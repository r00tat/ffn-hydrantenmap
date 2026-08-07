// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('../../firebase/firebase', () => ({
  default: {},
  firebaseApp: {},
  firestore: {},
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(async () => ''),
  getBlob: vi.fn(async () => new Blob()),
  listAll: vi.fn(async () => ({ items: [], prefixes: [] })),
  uploadBytesResumable: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

import { NON_CREATE_ITEMS } from '../../firebase/firestore';
import { fcItemClasses } from './index';
import {
  FIRECALL_ITEM_GROUPS,
  groupItemTypes,
  groupedCreatableItemTypes,
} from './itemGroups';

describe('FIRECALL_ITEM_GROUPS', () => {
  it('assigns every group key at most once', () => {
    const keys = FIRECALL_ITEM_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never lists the same item type in two groups', () => {
    const types = FIRECALL_ITEM_GROUPS.flatMap((g) => [...g.itemTypes]);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('groupedCreatableItemTypes', () => {
  const grouped = groupedCreatableItemTypes();
  const flattened = grouped.flatMap((g) => g.itemTypes);

  it('includes every creatable item class exactly once', () => {
    const creatable = Object.keys(fcItemClasses).filter(
      (key) => !NON_CREATE_ITEMS.includes(key),
    );
    for (const type of creatable) {
      expect(flattened).toContain(type);
    }
    expect(new Set(flattened).size).toBe(flattened.length);
  });

  it('excludes non-creatable item types', () => {
    for (const type of NON_CREATE_ITEMS) {
      expect(flattened).not.toContain(type);
    }
  });

  it('includes the class-less upload type', () => {
    expect(flattened).toContain('upload');
  });

  it('returns no empty groups', () => {
    for (const group of grouped) {
      expect(group.itemTypes.length).toBeGreaterThan(0);
    }
  });

  it('has no leftovers in the "other" catch-all group', () => {
    const other = grouped.find((g) => g.key === 'other');
    expect(other).toBeUndefined();
  });
});

describe('groupItemTypes', () => {
  it('puts unknown item types into the "other" catch-all group', () => {
    const grouped = groupItemTypes(['vehicle', 'brandNewThing']);
    const other = grouped.find((g) => g.key === 'other');
    expect(other?.itemTypes).toEqual(['brandNewThing']);
  });

  it('orders items by the group definition, not by input order', () => {
    const grouped = groupItemTypes(['rohr', 'hydrant', 'connection']);
    expect(grouped).toEqual([
      { key: 'waterSupply', itemTypes: ['hydrant', 'connection', 'rohr'] },
    ]);
  });

  it('keeps the group order defined in FIRECALL_ITEM_GROUPS', () => {
    const grouped = groupItemTypes(['layer', 'marker', 'vehicle']);
    expect(grouped.map((g) => g.key)).toEqual([
      'tactical',
      'drawing',
      'organisation',
    ]);
  });
});
