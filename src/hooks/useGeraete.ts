'use client';

import { useMemo } from 'react';
import {
  GERAET_BESTAND_COLLECTION,
  GERAET_COLLECTION,
  type Geraet,
  type GeraetBestand,
} from '../common/geraet';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import { useFirebaseCollectionState } from './useFirebaseCollection';

export interface UseGeraeteResult {
  /** Alle Artikel der Gruppe, nach Bezeichnung sortiert (auch inaktive). */
  geraete: Geraet[];
  /** Alle Bestände der Gruppe, über alle Artikel und Lagerorte. */
  bestaende: GeraetBestand[];
  /** Bestände je Artikel-ID — für Liste, Filter und Lagerortwahl. */
  bestaendeByGeraet: Map<string, GeraetBestand[]>;
  loading: boolean;
  /** Ergebnis nur aus dem lokalen Cache (offline) — Liste ggf. unvollständig. */
  fromCache: boolean;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * Geräte und Lagerartikel einer Gruppe samt Bestand je Lagerort, live über
 * `onSnapshot`.
 *
 * Gelesen wird im Browser: Die Firestore-Regeln erlauben es jedem
 * Gruppenmitglied, geschrieben wird nur über die Server Actions. Bewusst ohne
 * Abfragebedingungen — die Filter der Lagerseite (Klasse, Lagerort,
 * Verbrauchsmaterial, Mindestbestand) laufen im Speicher, und bei einigen
 * hundert Artikeln lohnt kein Index je Kombination.
 */
export default function useGeraete(groupId?: string): UseGeraeteResult {
  // Leerer Sammlungsname heißt: keine Subscription. Ein leeres
  // `pathSegments` allein abonnierte die Wurzel `groups`, die kein Client
  // lesen darf — dieselbe Vorsicht wie in `useFahrtenbuchMangel`.
  const geraeteState = useFirebaseCollectionState<Geraet>({
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, GERAET_COLLECTION] : [],
    includeMetadataChanges: true,
  });
  const bestaendeState = useFirebaseCollectionState<GeraetBestand>({
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, GERAET_BESTAND_COLLECTION] : [],
    includeMetadataChanges: true,
  });

  return useMemo(() => {
    if (!groupId) {
      return {
        geraete: [],
        bestaende: [],
        bestaendeByGeraet: new Map(),
        loading: false,
        fromCache: false,
      };
    }
    const geraete = [...(geraeteState.records ?? [])].sort((a, b) =>
      collator.compare(a.bezeichnung ?? '', b.bezeichnung ?? ''),
    );
    const bestaende = bestaendeState.records ?? [];
    const bestaendeByGeraet = new Map<string, GeraetBestand[]>();
    for (const b of bestaende) {
      const list = bestaendeByGeraet.get(b.geraetId);
      if (list) list.push(b);
      else bestaendeByGeraet.set(b.geraetId, [b]);
    }
    return {
      geraete,
      bestaende,
      bestaendeByGeraet,
      loading: geraeteState.loading || bestaendeState.loading,
      fromCache: geraeteState.fromCache || bestaendeState.fromCache,
    };
  }, [groupId, geraeteState, bestaendeState]);
}
