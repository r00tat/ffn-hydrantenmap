// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({ default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })) }));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));

vi.mock('../../../../components/firebase/firebase', () => ({
  firestore: {},
}));

vi.mock('../../../../components/firebase/firestore', () => ({
  FIRECALL_ITEMS_COLLECTION_ID: 'item',
  DataSchemaField: {},
}));

vi.mock('../../../../hooks/useMapEditor', () => ({
  useMapEditable: vi.fn(() => false),
}));

import { FirecallItemBase } from '../FirecallItemBase';

describe('FirecallItemBase.contextMenuItems', () => {
  it('returns null by default', () => {
    const item = new FirecallItemBase();
    const onClose = vi.fn();
    expect(item.contextMenuItems(onClose)).toBeNull();
  });
});
