import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../firebase/admin', () => ({
  firestore: { collection: () => ({ doc: () => ({ get: vi.fn() }) }) },
}));

const { CREATABLE_ITEM_TYPES, createCallFor } = await import('./writeTools');

describe('create_item', () => {
  it('bietet EL und ASSP weiterhin als eigene Typen an', () => {
    expect(CREATABLE_ITEM_TYPES).toEqual(
      expect.arrayContaining(['marker', 'el', 'assp', 'vehicle']),
    );
  });

  it.each(['marker', 'el', 'assp'])(
    'legt %s über createMarker mit der passenden Art an',
    (type) => {
      expect(createCallFor(type, { name: 'X' })).toEqual({
        name: 'createMarker',
        args: { name: 'X', kind: type },
      });
    },
  );

  it('reicht andere Typen unverändert an ihren Handler', () => {
    expect(createCallFor('vehicle', { name: 'TLFA' })).toEqual({
      name: 'createVehicle',
      args: { name: 'TLFA' },
    });
  });

  it('kennt keinen unbekannten Typ', () => {
    expect(createCallFor('foo', {})).toBeUndefined();
  });
});
