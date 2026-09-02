'use client';

import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_FUELLUNG_COLLECTION_ID,
  fuellungenGesamt,
  type AtemschutzFuellung,
} from '../common/atemschutz';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

/**
 * Schranke gegen einen wachsenden ersten Ladevorgang — keine Blätterfunktion.
 * Wer weiter zurück muss, filtert auf einen Einsatz.
 */
export const FUELLUNG_LIMIT = 500;

export interface UseAtemschutzFuellungenOptions {
  /**
   * `undefined` = alle Füllungen der Gruppe.
   * `''` = nur Stationsfüllungen ohne Einsatz.
   * Eine ID = nur die Füllungen dieses Einsatzes.
   */
  firecallId?: string;
  /**
   * Nur zu verrechnende Füllungen — die Abfrage der Verrechnungsübersicht.
   *
   * Serverseitig und nicht wie im Füllprotokoll clientseitig: Dort ist es ein
   * Filter auf einer ohnehin geladenen Liste, hier die Liste selbst. Braucht
   * den Index `verrechnen ASC, zeitpunkt DESC`.
   *
   * Nicht mit `firecallId` zusammen benutzen — die Kombination bräuchte einen
   * weiteren Index, und keine Seite fragt beides.
   */
  nurVerrechnen?: boolean;
  /**
   * Zeitraum als ISO-Zeitpunkte, beide eingeschlossen.
   *
   * Ein Bereich auf `zeitpunkt` — also auf dem Sortierfeld — braucht keinen
   * weiteren Index: Er läuft mit `firecallId ASC, zeitpunkt DESC` genauso wie
   * ohne Einsatzfilter. Deshalb steht der Zeitraum serverseitig und nicht wie
   * der Verrechnen-Filter im Speicher.
   */
  von?: string;
  bis?: string;
}

export interface UseAtemschutzFuellungenResult {
  fuellungen: AtemschutzFuellung[];
  /** Summe der `anzahl` über alle Zeilen — die Sammelerfassung zählt voll. */
  flaschenGesamt: number;
}

/**
 * Das Füllprotokoll einer Gruppe, wahlweise auf einen Einsatz eingeschränkt.
 */
export default function useAtemschutzFuellungen(
  groupId?: string,
  options: UseAtemschutzFuellungenOptions = {},
): UseAtemschutzFuellungenResult {
  const { firecallId, nurVerrechnen, von, bis } = options;

  const queryConstraints = useMemo<QueryConstraint[]>(() => {
    const constraints: QueryConstraint[] = [];
    // Der leere String ist ein *Wert*, kein „kein Filter" — deshalb auf
    // `undefined` prüfen und nicht auf Wahrheit.
    if (firecallId !== undefined) {
      constraints.push(where('firecallId', '==', firecallId));
    }
    if (nurVerrechnen) {
      constraints.push(where('verrechnen', '==', true));
    }
    if (von) constraints.push(where('zeitpunkt', '>=', von));
    if (bis) constraints.push(where('zeitpunkt', '<=', bis));
    constraints.push(orderBy('zeitpunkt', 'desc'), limit(FUELLUNG_LIMIT));
    return constraints;
  }, [bis, firecallId, nurVerrechnen, von]);

  const fuellungen = useFirebaseCollection<AtemschutzFuellung>({
    // Leerer Name heißt: keine Subscription. Ein leeres `pathSegments`
    // abonnierte die Wurzel-Collection `groups`, die kein Client lesen darf.
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, ATEMSCHUTZ_FUELLUNG_COLLECTION_ID] : [],
    queryConstraints,
  });

  return useMemo(() => {
    const list = groupId ? (fuellungen ?? []) : [];
    return { fuellungen: list, flaschenGesamt: fuellungenGesamt(list) };
  }, [groupId, fuellungen]);
}
