'use client';

import { orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_GERAET_COLLECTION_ID,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
} from '../common/atemschutz';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseAtemschutzGeraeteResult {
  geraete: AtemschutzGeraet[];
  activeGeraete: AtemschutzGeraet[];
  flaschen: AtemschutzGeraet[];
  /** Die aktiven Füllstationen — Grundlage von `waehleFuellstation`. */
  fuellstationen: AtemschutzGeraet[];
  geraeteById: Map<string, AtemschutzGeraet>;
  /** Alle vorkommenden Feuerwehren, alphabetisch — für die Autovervollständigung. */
  feuerwehren: string[];
}

/**
 * Die Atemschutz-Ausrüstung einer Gruppe.
 *
 * Lädt bewusst die ganze Liste und filtert im Speicher: Es sind einige hundert
 * Dokumente, und die Codesuche beim Scannen braucht ohnehin alle Kennungen auf
 * einmal — eine Abfrage je Scan wäre langsamer und bräuchte einen Index.
 */
export default function useAtemschutzGeraete(
  groupId?: string,
): UseAtemschutzGeraeteResult {
  const geraete = useFirebaseCollection<AtemschutzGeraet>({
    // Leerer String heißt: keine Subscription. Ein leeres `pathSegments`
    // allein abonnierte die Wurzel-Collection `groups`, die kein Client lesen
    // darf — dieselbe Vorsichtsmaßnahme wie in `useFahrtenbuchVehicles`.
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, ATEMSCHUTZ_GERAET_COLLECTION_ID] : [],
    queryConstraints: [orderBy('bezeichnung', 'asc')],
  });

  return useMemo(() => {
    const list = groupId ? (geraete ?? []) : [];
    const byNummer = [...list].sort((a, b) =>
      (a.nummer ?? a.bezeichnung).localeCompare(
        b.nummer ?? b.bezeichnung,
        'de',
        { numeric: true },
      ),
    );
    const activeGeraete = byNummer.filter((g) => g.active !== false);
    const isTyp = (typ: AtemschutzGeraetTyp) => (g: AtemschutzGeraet) =>
      g.typ === typ;
    return {
      geraete: byNummer,
      activeGeraete,
      flaschen: activeGeraete.filter(isTyp('flasche')),
      fuellstationen: activeGeraete.filter(isTyp('fuellstation')),
      geraeteById: new Map(byNummer.map((g) => [g.id as string, g])),
      feuerwehren: [
        ...new Set(byNummer.map((g) => g.feuerwehr).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, 'de')),
    };
  }, [groupId, geraete]);
}
