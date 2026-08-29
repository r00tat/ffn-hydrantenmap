'use client';

import { useMemo } from 'react';
import type { AtemschutzTrupp } from '../common/atemschutz';
import useCrewAssignments from './useCrewAssignments';
import useFahrtenbuchPersons from './useFahrtenbuchPersons';

export interface PersonSuggestionSources {
  /** Namen aus den Trupps dieses Einsatzes. */
  trupps: AtemschutzTrupp[];
  /** ASSP-Leiter und Füllpersonal des Einsatzes. */
  asspLeiter?: string;
  asspFuellpersonal?: string[];
}

/**
 * Namensvorschläge aus drei Quellen: die gepflegten Personen der Gruppe, die
 * Einsatzmannschaft und alles, was in diesem Einsatz bereits eingetippt wurde.
 *
 * Bewusst Vorschläge und keine feste Auswahl: Am Sammelplatz stehen
 * Auswärtige, für die es in keiner Liste einen Eintrag gibt. Die dritte Quelle
 * ist die wichtigste — sie sorgt dafür, dass derselbe Auswärtige beim zweiten
 * Mal nicht anders geschrieben wird.
 */
export default function useAtemschutzPersonSuggestions(
  groupId: string | undefined,
  sources: PersonSuggestionSources,
): string[] {
  const { activePersons } = useFahrtenbuchPersons(groupId);
  const { crewAssignments } = useCrewAssignments();

  const { trupps, asspLeiter, asspFuellpersonal } = sources;

  return useMemo(() => {
    const namen = new Set<string>();
    const add = (value?: string) => {
      const t = value?.trim();
      if (t) namen.add(t);
    };

    for (const p of activePersons ?? []) add(p.name);
    for (const c of crewAssignments ?? []) add(c.name);
    for (const t of trupps) for (const m of t.mitglieder) add(m);
    add(asspLeiter);
    for (const p of asspFuellpersonal ?? []) add(p);

    return [...namen].sort((a, b) => a.localeCompare(b, 'de'));
  }, [activePersons, crewAssignments, trupps, asspLeiter, asspFuellpersonal]);
}
