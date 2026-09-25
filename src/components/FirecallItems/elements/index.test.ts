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

import { FirecallItemLayer } from './FirecallItemLayer';
import { fcItemClasses, getItemClass } from './index';

describe('fcItemClasses', () => {
  // The type picker and the sidebar render `factory().icon()`; a class that
  // inherits the base factory would show the generic marker icon instead.
  it.each(Object.entries(fcItemClasses))(
    'factory of %s returns an instance of its own class',
    (_type, cls) => {
      expect(cls.factory()).toBeInstanceOf(cls);
    }
  );

  it('uses the layer icon for layers', () => {
    expect(getItemClass('layer').factory()).toBeInstanceOf(FirecallItemLayer);
    expect(getItemClass('layer').factory().icon().options.iconUrl).toBe(
      '/icons/layer.svg'
    );
  });
});
