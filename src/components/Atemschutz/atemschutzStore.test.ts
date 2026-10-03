import { beforeEach, describe, expect, it, vi } from 'vitest';

// Echte Schreibhelfer, aber ein Firestore, dessen Server-Bestätigung nie
// kommt — so verhält sich das SDK offline. Jede Funktion des Stores muss
// trotzdem sofort zurückkehren, sonst hängt der Dialog darüber.
const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  ensureFreshAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  updateDoc: hoisted.updateDoc,
  deleteDoc: hoisted.deleteDoc,
  addDoc: hoisted.addDoc,
  doc: hoisted.doc,
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  arrayUnion: vi.fn((...values: unknown[]) => ({ arrayUnion: values })),
  writeBatch: vi.fn(),
}));

vi.mock('../firebase/firebase', () => ({ firestore: {}, auth: {} }));
vi.mock('../../app/firebaseAuth', () => ({ firebaseTokenLogin: vi.fn() }));
vi.mock('../../hooks/auth/ensureFreshAuth', () => ({
  ensureFreshAuth: hoisted.ensureFreshAuth,
  isAuthError: () => false,
}));

import {
  addAusgabe,
  addDruckabfrage,
  addFuellung,
  addTrupp,
  deleteTrupp,
  updateTrupp,
  updateUeberwachung,
  vermerkeTagebuch,
} from './atemschutzStore';

const actor = { userId: 'uid-1', now: '2026-10-03T10:00:00.000Z' };

describe('atemschutzStore offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const never = () => new Promise<never>(() => {});
    hoisted.setDoc.mockImplementation(never);
    hoisted.updateDoc.mockImplementation(never);
    hoisted.deleteDoc.mockImplementation(never);
    hoisted.addDoc.mockImplementation(never);
    hoisted.ensureFreshAuth.mockImplementation(never);
    hoisted.doc.mockImplementation((coll: { path?: string } | undefined, id?: string) => ({
      id: id ?? 'local-id',
      path: `${coll?.path ?? ''}/${id ?? 'local-id'}`,
    }));
  });

  it('addTrupp returns the device-generated id without server confirmation', async () => {
    const id = await addTrupp('fc-1', { feuerwehr: 'Neusiedl' } as never, actor);
    expect(id).toBe('local-id');
    expect(hoisted.setDoc).toHaveBeenCalledTimes(1);
    expect(hoisted.addDoc).not.toHaveBeenCalled();
  });

  it('addDruckabfrage returns without server confirmation', async () => {
    await addDruckabfrage(
      'fc-1',
      { id: 't-1', ueberwachungUids: [] } as never,
      { zeit: actor.now, druck: [280] } as never,
      actor,
    );
    expect(hoisted.updateDoc).toHaveBeenCalledTimes(1);
  });

  it('the other writes return without server confirmation as well', async () => {
    await updateTrupp('fc-1', 't-1', { bemerkung: 'x' }, actor);
    await updateUeberwachung('fc-1', 't-1', {} as never, actor);
    await vermerkeTagebuch('fc-1', 't-1', 'amZiel', actor);
    await deleteTrupp('fc-1', 't-1');
    await addAusgabe('fc-1', {} as never, actor);
    await addFuellung('grp', {} as never, actor);
    expect(hoisted.updateDoc).toHaveBeenCalledTimes(3);
    expect(hoisted.deleteDoc).toHaveBeenCalledTimes(1);
    expect(hoisted.setDoc).toHaveBeenCalledTimes(2);
  });
});
