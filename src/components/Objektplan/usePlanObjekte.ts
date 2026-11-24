'use client';

import { useMemo } from 'react';
import type { GefahrObjekt, RisikoObjekt } from '../../common/gis-objects';
import { tagObjekte, type PlanObjekt } from '../../common/objektplan/objektArt';
import { useFirebaseCollectionState } from '../../hooks/useFirebaseCollection';

export interface PlanObjekteState {
  records: PlanObjekt[];
  loading: boolean;
  fromCache: boolean;
}

/**
 * Risikoobjekte und gefährdete Objekte gemeinsam, jedes mit seiner Art. Beide
 * haben Pläne; gelesen werden die Collections direkt, nicht die Cluster der
 * Karte — dort steht ein geänderter Drive-Link erst nach `updateClusters`.
 * Der Firestore-Cache hält die Listen auch offline. Hintergrund:
 * docs/objektplaene.md, „Risikoobjekte und gefährdete Objekte".
 */
export function usePlanObjekte(
  options: { includeMetadataChanges?: boolean } = {},
): PlanObjekteState {
  const risiko = useFirebaseCollectionState<RisikoObjekt>({
    collectionName: 'risikoobjekt',
    includeMetadataChanges: options.includeMetadataChanges,
  });
  const gefahr = useFirebaseCollectionState<GefahrObjekt>({
    collectionName: 'gefahrobjekt',
    includeMetadataChanges: options.includeMetadataChanges,
  });

  const records = useMemo<PlanObjekt[]>(
    () => [
      ...tagObjekte('risikoobjekt', risiko.records),
      ...tagObjekte('gefahrobjekt', gefahr.records),
    ],
    [risiko.records, gefahr.records],
  );

  return {
    records,
    loading: risiko.loading || gefahr.loading,
    fromCache: risiko.fromCache || gefahr.fromCache,
  };
}
