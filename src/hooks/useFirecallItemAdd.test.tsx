// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Echte Schreibhelfer aus `firestoreClient`, aber ein Firestore, dessen
// Server-Bestätigung nie kommt — so verhält sich das SDK offline.
const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
  ensureFreshAuth: vi.fn(),
  logChange: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  addDoc: hoisted.addDoc,
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: hoisted.doc,
  collection: hoisted.collection,
  writeBatch: vi.fn(),
}));

vi.mock('../components/firebase/firebase', () => ({ firestore: {}, auth: {} }));
vi.mock('../app/firebaseAuth', () => ({ firebaseTokenLogin: vi.fn() }));
vi.mock('./auth/ensureFreshAuth', () => ({
  ensureFreshAuth: hoisted.ensureFreshAuth,
  isAuthError: () => false,
}));
vi.mock('../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));
vi.mock('./useFirebaseLogin', () => ({
  default: () => ({ email: 'muster@example.com' }),
}));
vi.mock('./useFirecall', () => ({ useFirecallId: () => 'fc-1' }));
vi.mock('./useAuditLog', () => ({ useAuditLog: () => hoisted.logChange }));
vi.mock('../components/FirecallItems/elements', () => ({
  getItemClass: () => ({ firebaseCollectionName: () => 'item' }),
}));

import useFirecallItemAdd from './useFirecallItemAdd';

describe('useFirecallItemAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const never = () => new Promise<never>(() => {});
    hoisted.setDoc.mockImplementation(never);
    hoisted.addDoc.mockImplementation(never);
    hoisted.ensureFreshAuth.mockImplementation(never);
    hoisted.collection.mockReturnValue({ path: 'call/fc-1/item' });
    hoisted.doc.mockReturnValue({ id: 'local-id', path: 'call/fc-1/item/local-id' });
  });

  it('returns the device-generated ref although the server never confirms', async () => {
    const { result } = renderHook(() => useFirecallItemAdd());

    const ref = await result.current({ type: 'diary', name: 'Lagemeldung' } as never);

    expect(ref.id).toBe('local-id');
    expect(hoisted.setDoc).toHaveBeenCalledTimes(1);
    expect(hoisted.addDoc).not.toHaveBeenCalled();
    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', elementId: 'local-id' }),
    );
  });
});
