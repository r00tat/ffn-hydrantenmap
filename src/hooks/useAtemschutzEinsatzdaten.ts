'use client';

import { orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_AUSGABE_COLLECTION_ID,
  ATEMSCHUTZ_FUELLUNG_COLLECTION_ID,
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  fuellungenGesamt,
  gruppiereTrupps,
  type AtemschutzAusgabe,
  type AtemschutzFuellung,
  type AtemschutzTrupp,
  type TruppGruppen,
} from '../common/atemschutz';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseAtemschutzEinsatzdatenResult {
  fuellungen: AtemschutzFuellung[];
  /** Summe der `anzahl` über alle Zeilen — die Sammelerfassung zählt voll. */
  flaschenGesamt: number;
  trupps: TruppGruppen;
  ausgaben: AtemschutzAusgabe[];
  /** Zustand je Gerät, für den Ausrüstungsreiter. */
  ausgabeByGeraet: Map<string, AtemschutzAusgabe>;
}

/**
 * Die Protokolle eines Einsatzes.
 *
 * Alle drei Untersammlungen in einem Hook: Sie hängen an derselben Seite, und
 * drei Hooks bedeuteten dreimal dieselbe Prüfung auf eine gültige Einsatz-ID.
 */
export default function useAtemschutzEinsatzdaten(
  firecallId?: string,
): UseAtemschutzEinsatzdatenResult {
  // 'unknown' ist der Platzhalter, den `useFirecallId` liefert, solange kein
  // Einsatz gewählt ist — darauf zu abonnieren liefe in permission-denied.
  const id = firecallId && firecallId !== 'unknown' ? firecallId : '';

  const fuellungen = useFirebaseCollection<AtemschutzFuellung>({
    collectionName: id ? FIRECALL_COLLECTION_ID : '',
    pathSegments: id ? [id, ATEMSCHUTZ_FUELLUNG_COLLECTION_ID] : [],
    queryConstraints: [orderBy('zeitpunkt', 'desc')],
  });

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
    const f = id ? (fuellungen ?? []) : [];
    const t = id ? (trupps ?? []) : [];
    const a = id ? (ausgaben ?? []) : [];
    return {
      fuellungen: f,
      flaschenGesamt: fuellungenGesamt(f),
      trupps: gruppiereTrupps(t),
      ausgaben: a,
      ausgabeByGeraet: new Map(a.map((x) => [x.geraetId, x])),
    };
  }, [id, fuellungen, trupps, ausgaben]);
}
