'use client';

import { orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  ATEMSCHUTZ_GERAET_COLLECTION_ID,
  type AtemschutzGeraet,
  type AtemschutzGeraetTyp,
} from '../common/atemschutz';
import { atemschutzSearchGroupIds } from './atemschutzSearchGroups';
import useFirebaseLogin from './useFirebaseLogin';
import useGroupsCollection from './useGroupsCollection';

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

const BEZEICHNUNG_ASC = [orderBy('bezeichnung', 'asc')];

/**
 * Die Atemschutz-Ausrüstung einer oder mehrerer Gruppen.
 *
 * Lädt bewusst die ganze Liste und filtert im Speicher: Es sind einige hundert
 * Dokumente je Gruppe, und die Codesuche beim Scannen braucht ohnehin alle
 * Kennungen auf einmal — eine Abfrage je Scan wäre langsamer und bräuchte
 * einen Index.
 *
 * Jedes Gerät trägt `groupId`, die Gruppe, der es gehört. Die IDs sind
 * Firestore-Auto-IDs und damit über Gruppen hinweg eindeutig; `geraeteById`
 * braucht deshalb keinen zusammengesetzten Schlüssel.
 */
export default function useAtemschutzGeraete(
  groupIds: readonly string[],
): UseAtemschutzGeraeteResult {
  const geraete = useGroupsCollection<AtemschutzGeraet>(
    groupIds,
    ATEMSCHUTZ_GERAET_COLLECTION_ID,
    BEZEICHNUNG_ASC,
  );

  return useMemo(() => {
    const byNummer = [...geraete].sort((a, b) =>
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
  }, [geraete]);
}

/**
 * Die Gruppen, in denen der Benutzer suchen darf, mit `groupId` als
 * Arbeitsgruppe vorneweg — siehe `atemschutzSearchGroupIds`.
 */
export function useAtemschutzSearchGroupIds(groupId?: string): string[] {
  const { groupRoles } = useFirebaseLogin();
  // groupRoles ist je Render ein neues Objekt; der Schlüssel hält das Ergebnis stabil.
  const rolesKey = JSON.stringify(groupRoles ?? {});
  return useMemo(
    () =>
      atemschutzSearchGroupIds(groupId, {
        groupRoles: JSON.parse(rolesKey),
      }),
    [groupId, rolesKey],
  );
}
