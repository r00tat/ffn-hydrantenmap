// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onSnapshotMock, useFirebaseLoginMock } = vi.hoisted(() => ({
  onSnapshotMock: vi.fn(() => vi.fn()),
  useFirebaseLoginMock: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  onSnapshot: onSnapshotMock,
}));

vi.mock('../components/firebase/firebase', () => ({ firestore: {} }));

vi.mock('./useFirebaseLogin', () => ({ default: useFirebaseLoginMock }));

import { useKostenersatzVehicles } from './useKostenersatzVehicles';

beforeEach(() => {
  vi.clearAllMocks();
  useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: true });
});

describe('useKostenersatzVehicles', () => {
  it('abonniert die Fahrzeuge, sobald ein Firebase-Benutzer da ist', () => {
    renderHook(() => useKostenersatzVehicles());
    expect(onSnapshotMock).toHaveBeenCalled();
  });

  it('fragt ohne Firebase-Benutzer gar nicht erst an', () => {
    // `request.auth` ist dann null, und die Regel lehnt ab. Auf dem
    // Login-Bildschirm ist genau das der Normalfall — die Abfrage waere ein
    // sicherer Fehlschlag, der als Konsolenfehler und in Crashlytics landet.
    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: false });
    renderHook(() => useKostenersatzVehicles());
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it('liefert ohne Benutzer die Standardfahrzeuge statt eines Ladezustands', () => {
    // Ohne Abo kommt nie ein Snapshot — `loading` duerfte sonst ewig stehen.
    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: false });
    const { result } = renderHook(() => useKostenersatzVehicles());
    expect(result.current.loading).toBe(false);
    expect(result.current.vehicles.length).toBeGreaterThan(0);
    expect(result.current.isUsingDefaults).toBe(true);
  });

  it('holt die Abfrage nach, wenn die Anmeldung nachkommt', () => {
    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: false });
    const { rerender } = renderHook(() => useKostenersatzVehicles());
    expect(onSnapshotMock).not.toHaveBeenCalled();

    useFirebaseLoginMock.mockReturnValue({ hasFirebaseUser: true });
    rerender();
    expect(onSnapshotMock).toHaveBeenCalled();
  });
});
