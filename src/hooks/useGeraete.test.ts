// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../common/geraet';

const { useFirebaseCollectionState } = vi.hoisted(() => ({
  useFirebaseCollectionState: vi.fn(),
}));

vi.mock('./useFirebaseCollection', () => ({
  default: vi.fn(),
  useFirebaseCollectionState,
}));

import useGeraete from './useGeraete';

function geraet(over: Partial<Geraet>): Geraet {
  return {
    id: 'g1',
    bezeichnung: 'Bindevlies',
    verbrauchsmaterial: true,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function bestand(over: Partial<GeraetBestand>): GeraetBestand {
  return {
    id: 'b1',
    geraetId: 'g1',
    lagerortKey: 'fahrzeug|srf|gr 2',
    lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
    anzahl: 1,
    ...over,
  };
}

/** Liefert je Sammlung, was der Test vorgibt. */
function mockCollections(
  geraete: Geraet[],
  bestaende: GeraetBestand[],
  loading = false,
) {
  useFirebaseCollectionState.mockImplementation(
    ({ pathSegments }: { pathSegments: string[] }) => {
      const name = pathSegments[1];
      if (name === 'geraet') return { records: geraete, loading, fromCache: false };
      if (name === 'geraetBestand')
        return { records: bestaende, loading, fromCache: false };
      return { records: [], loading: false, fromCache: false };
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useGeraete', () => {
  it('abonniert ohne Gruppe nichts', () => {
    mockCollections([], []);
    const { result } = renderHook(() => useGeraete(undefined));
    for (const [options] of useFirebaseCollectionState.mock.calls) {
      expect(options.collectionName).toBe('');
    }
    expect(result.current.geraete).toEqual([]);
    expect(result.current.bestaende).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('liest Artikel und Bestände unter groups/{groupId}', () => {
    mockCollections([], []);
    renderHook(() => useGeraete('ffnd'));
    const paths = useFirebaseCollectionState.mock.calls.map(([o]) => [
      o.collectionName,
      ...o.pathSegments,
    ]);
    expect(paths).toContainEqual(['groups', 'ffnd', 'geraet']);
    expect(paths).toContainEqual(['groups', 'ffnd', 'geraetBestand']);
  });

  it('sortiert die Artikel nach Bezeichnung', () => {
    mockCollections(
      [
        geraet({ id: 'a', bezeichnung: 'Zange' }),
        geraet({ id: 'b', bezeichnung: 'Ölbinder' }),
        geraet({ id: 'c', bezeichnung: 'Absperrband' }),
      ],
      [],
    );
    const { result } = renderHook(() => useGeraete('ffnd'));
    expect(result.current.geraete.map((g) => g.bezeichnung)).toEqual([
      'Absperrband',
      'Ölbinder',
      'Zange',
    ]);
  });

  it('gruppiert die Bestände je Artikel', () => {
    mockCollections(
      [geraet({ id: 'g1' }), geraet({ id: 'g2', bezeichnung: 'Filter' })],
      [
        bestand({ id: 'b1', geraetId: 'g1' }),
        bestand({ id: 'b2', geraetId: 'g1', lagerortKey: 'raum|feuerwehrhaus|lager' }),
        bestand({ id: 'b3', geraetId: 'g2' }),
      ],
    );
    const { result } = renderHook(() => useGeraete('ffnd'));
    expect(result.current.bestaendeByGeraet.get('g1')?.map((b) => b.id)).toEqual([
      'b1',
      'b2',
    ]);
    expect(result.current.bestaendeByGeraet.get('g2')?.map((b) => b.id)).toEqual([
      'b3',
    ]);
  });

  it('lässt archivierte Lagerorte in Liste und Gruppierung weg, nicht aber im Nachschlagen', () => {
    mockCollections(
      [geraet({ id: 'g1' })],
      [bestand({ id: 'b1' }), bestand({ id: 'b2', archiviert: true, anzahl: 0 })],
    );
    const { result } = renderHook(() => useGeraete('ffnd'));
    expect(result.current.bestaende.map((b) => b.id)).toEqual(['b1']);
    expect(result.current.bestaendeByGeraet.get('g1')?.map((b) => b.id)).toEqual(['b1']);
    expect(result.current.bestandById.get('b2')?.archiviert).toBe(true);
  });

  it('meldet loading, solange eine der Sammlungen lädt', () => {
    mockCollections([], [], true);
    const { result } = renderHook(() => useGeraete('ffnd'));
    expect(result.current.loading).toBe(true);
  });
});
