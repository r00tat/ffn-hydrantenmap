'use client';

import { useMemo } from 'react';
import type { AtemschutzTrupp } from '../common/atemschutz';
import { atemschutzPersons, type PersonQualifications } from '../common/personal';
import useCrewAssignments from './useCrewAssignments';
import useFahrtenbuchPersons from './useFahrtenbuchPersons';

export interface PersonSuggestionSources {
  /** Namen aus den Trupps dieses Einsatzes. */
  trupps: Pick<AtemschutzTrupp, 'mitglieder'>[];
  /** ASSP-Leiter und Füllpersonal des Einsatzes. */
  asspLeiter?: string;
  asspFuellpersonal?: string[];
}

/**
 * Die Vorschlagsliste aus allen Quellen, sortiert und ohne Dubletten.
 *
 * Aus dem Personalstand kommen nur die eingetragenen Atemschutzträger
 * (`src/common/personal.ts`): Ein Name in der Trupp-Auswahl ist eine Aussage,
 * dass die Person unter Atemschutz gehen darf. Mannschaft und Eingetipptes
 * bleiben ungefiltert — für Auswärtige gibt es keinen Personaleintrag.
 */
export function buildAtemschutzSuggestions({
  persons,
  crewNames,
  ...sources
}: PersonSuggestionSources & {
  persons: (PersonQualifications & { name?: string })[];
  crewNames: string[];
}): string[] {
  const namen = new Set<string>();
  const add = (value?: string) => {
    const t = value?.trim();
    if (t) namen.add(t);
  };

  for (const p of atemschutzPersons(persons)) add(p.name);
  for (const name of crewNames) add(name);
  for (const t of sources.trupps) for (const m of t.mitglieder) add(m);
  add(sources.asspLeiter);
  for (const p of sources.asspFuellpersonal ?? []) add(p);

  return [...namen].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Namensvorschläge aus drei Quellen: die Atemschutzträger der Gruppe, die
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

  return useMemo(
    () =>
      buildAtemschutzSuggestions({
        persons: activePersons ?? [],
        crewNames: (crewAssignments ?? []).map((c) => c.name),
        trupps,
        asspLeiter,
        asspFuellpersonal,
      }),
    [activePersons, crewAssignments, trupps, asspLeiter, asspFuellpersonal],
  );
}
