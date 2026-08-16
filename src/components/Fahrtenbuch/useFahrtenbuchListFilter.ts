'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  EMPTY_FAHRTENBUCH_LIST_FILTER,
  FAHRTENBUCH_LIST_FILTER_PARAMS,
  fahrtenbuchListFilterToParams,
  parseFahrtenbuchListFilter,
  type FahrtenbuchListFilter,
} from '../../common/fahrtenbuchListFilter';

export interface UseFahrtenbuchListFilter {
  filter: FahrtenbuchListFilter;
  setFilter: (filter: FahrtenbuchListFilter) => void;
  resetFilter: () => void;
}

/**
 * Der Filter der Fahrtenliste, gespiegelt in die Query-Parameter der Seite.
 *
 * Geschrieben wird mit `window.history.replaceState` und nicht über
 * `router.replace`: Next.js führt beide Verlaufsmethoden mit `useSearchParams`
 * zusammen (siehe „Shallow routing on the client"), aber nur die native löst
 * keine Navigation aus. Über den Router hinge an jedem getippten Buchstaben im
 * Suchfeld ein Routenwechsel — genau der Grund, aus dem die Mängelliste die URL
 * bisher nur als Vorbelegung liest.
 *
 * `replaceState` statt `pushState`, damit die Zurück-Taste die Seite verlässt
 * und nicht Tastendruck für Tastendruck durch die Sucheingabe zurückläuft.
 *
 * Fremde Parameter derselben Seite bleiben erhalten; entfernt werden nur die
 * eigenen.
 */
export default function useFahrtenbuchListFilter(): UseFahrtenbuchListFilter {
  const searchParams = useSearchParams();

  // Nur die Vorbelegung kommt aus der URL — danach führt der Benutzer den
  // Filter, und der Zustand hier ist die Wahrheit.
  //
  // `searchParams` ist außerhalb einer Router-Umgebung `null` (im Test, und im
  // Prerender ohne Suspense-Grenze). Ein leerer Filter ist dort die richtige
  // Antwort — eine ungefilterte Liste, keine kaputte Seite.
  const [filter, setFilterState] = useState<FahrtenbuchListFilter>(() =>
    parseFahrtenbuchListFilter(new URLSearchParams(searchParams?.toString())),
  );

  const setFilter = useCallback((next: FahrtenbuchListFilter) => {
    setFilterState(next);
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    for (const key of FAHRTENBUCH_LIST_FILTER_PARAMS) params.delete(key);
    for (const [key, value] of Object.entries(
      fahrtenbuchListFilterToParams(next),
    )) {
      params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, []);

  const resetFilter = useCallback(
    () => setFilter(EMPTY_FAHRTENBUCH_LIST_FILTER),
    [setFilter],
  );

  return { filter, setFilter, resetFilter };
}
