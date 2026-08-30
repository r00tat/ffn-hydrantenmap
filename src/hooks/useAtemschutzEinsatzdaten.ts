'use client';

import { orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_AUSGABE_COLLECTION_ID,
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  gruppiereTrupps,
  type AtemschutzAusgabe,
  type AtemschutzTrupp,
  type TruppGruppen,
} from '../common/atemschutz';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseAtemschutzEinsatzdatenResult {
  trupps: TruppGruppen;
  ausgaben: AtemschutzAusgabe[];
  /** Zustand je Gerät, für den Ausrüstungsreiter. */
  ausgabeByGeraet: Map<string, AtemschutzAusgabe>;
}

/**
 * Trupps und Ausrüstungsausgaben eines Einsatzes.
 *
 * Das Füllprotokoll steht bewusst *nicht* hier: Es liegt seit dem Umzug unter
 * der Gruppe und wird von `useAtemschutzFuellungen` geladen.
 *
 * Beide Untersammlungen in einem Hook: Sie hängen an derselben Seite, und zwei
 * Hooks bedeuteten zweimal dieselbe Prüfung auf eine gültige Einsatz-ID.
 */
export default function useAtemschutzEinsatzdaten(
  firecallId?: string,
): UseAtemschutzEinsatzdatenResult {
  // 'unknown' ist der Platzhalter, den `useFirecallId` liefert, solange kein
  // Einsatz gewählt ist — darauf zu abonnieren liefe in permission-denied.
  const id = firecallId && firecallId !== 'unknown' ? firecallId : '';

  const trupps = useFirebaseCollection<AtemschutzTrupp>({
    collectionName: id ? FIRECALL_COLLECTION_ID : '',
    pathSegments: id ? [id, ATEMSCHUTZ_TRUPP_COLLECTION_ID] : [],
    queryConstraints: [orderBy('bereitSeit', 'desc')],
  });

  const ausgaben = useFirebaseCollection<AtemschutzAusgabe>({
    collectionName: id ? FIRECALL_COLLECTION_ID : '',
    pathSegments: id ? [id, ATEMSCHUTZ_AUSGABE_COLLECTION_ID] : [],
  });

  return useMemo(() => {
    const t = id ? (trupps ?? []) : [];
    const a = id ? (ausgaben ?? []) : [];
    return {
      trupps: gruppiereTrupps(t),
      ausgaben: a,
      ausgabeByGeraet: new Map(a.map((x) => [x.geraetId, x])),
    };
  }, [id, trupps, ausgaben]);
}
