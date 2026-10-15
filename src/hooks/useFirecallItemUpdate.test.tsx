// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  doc: vi.fn(),
  ensureFreshAuth: vi.fn(),
  ensureConnectionDerived: vi.fn(),
  logChange: vi.fn(),
  getDocFromCache: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: hoisted.doc,
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
  getDocFromCache: hoisted.getDocFromCache,
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
vi.mock(
  '../components/FirecallItems/elements/connection/ensureConnectionDerived',
  () => ({ ensureConnectionDerived: hoisted.ensureConnectionDerived }),
);
vi.mock('../components/FirecallItems/elements/connection/streetRouting', () => ({
  isStreetRoutingItem: (type: string) => type === 'connection',
}));
vi.mock('../common/computeFieldValue', () => ({ computeAllFields: vi.fn() }));

import useFirecallItemUpdate from './useFirecallItemUpdate';

describe('useFirecallItemUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const never = () => new Promise<never>(() => {});
    hoisted.setDoc.mockImplementation(never);
    hoisted.ensureFreshAuth.mockImplementation(never);
    hoisted.ensureConnectionDerived.mockImplementation(never);
    hoisted.doc.mockReturnValue({ id: 'x', path: 'call/fc-1/item/x' });
    hoisted.getDocFromCache.mockRejectedValue(new Error('not cached'));
  });

  it('returns although the server never confirms the write', async () => {
    const { result } = renderHook(() => useFirecallItemUpdate());

    await result.current({ id: 'x', type: 'diary', name: 'Eintrag' } as never);

    expect(hoisted.setDoc).toHaveBeenCalledTimes(1);
    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', elementId: 'x' }),
    );
  });

  it('does not wait for street routing of a hose line', async () => {
    const { result } = renderHook(() => useFirecallItemUpdate());

    await result.current({ id: 'x', type: 'connection', name: 'B-Leitung' } as never);

    expect(hoisted.ensureConnectionDerived).toHaveBeenCalledTimes(1);
  });

  it('logs a soft delete as delete, not as update', async () => {
    const { result } = renderHook(() => useFirecallItemUpdate());

    await result.current({
      id: 'x',
      type: 'marker',
      name: 'Marker',
      deleted: true,
    } as never);

    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', elementId: 'x' }),
    );
  });

  it('logs undeleting an item as restore', async () => {
    hoisted.getDocFromCache.mockResolvedValue({
      exists: () => true,
      data: () => ({ type: 'marker', name: 'Marker', deleted: true }),
    });
    const { result } = renderHook(() => useFirecallItemUpdate());

    await result.current({ id: 'x', type: 'marker', name: 'Marker' } as never);

    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'restore' }),
    );
  });

  it('takes the previous value from the local cache when the caller passes none', async () => {
    // Viele Aufrufer übergeben keinen Vorzustand — ohne ihn fehlt im
    // Audit-Log, was vor der Änderung im Feld stand.
    hoisted.getDocFromCache.mockResolvedValue({
      exists: () => true,
      data: () => ({ type: 'marker', name: 'Alt', beschreibung: 'vorher' }),
    });
    const { result } = renderHook(() => useFirecallItemUpdate());

    await result.current({ id: 'x', type: 'marker', name: 'Neu' } as never);

    expect(hoisted.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        previousValue: expect.objectContaining({
          name: 'Alt',
          beschreibung: 'vorher',
        }),
        newValue: expect.objectContaining({ name: 'Neu' }),
      }),
    );
  });
});
