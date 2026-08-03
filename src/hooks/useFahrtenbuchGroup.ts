'use client';

import { useCallback, useMemo, useState } from 'react';
import { NON_TENANT_GROUP_IDS } from '../app/groups/groupTypes';
import useFirebaseLogin from './useFirebaseLogin';

const STORAGE_KEY = 'fahrtenbuch.group';

/**
 * Gruppen des Benutzers plus die Vorauswahl: zuletzt genutzte Gruppe aus dem
 * localStorage, sonst die erste Gruppe.
 *
 * `groupId` wird direkt beim Rendern aus `groups` und der optionalen manuellen
 * Auswahl abgeleitet statt über einen Effekt nachgezogen — das vermeidet einen
 * zusätzlichen Render-Zyklus und das Lint-Problem "setState in effect"
 * (abgeleiteter Zustand sollte während des Renderns berechnet werden, siehe
 * https://react.dev/learn/you-might-not-need-an-effect).
 */
export default function useFahrtenbuchGroup() {
  const { myGroups } = useFirebaseLogin();
  const [manualGroupId, setManualGroupId] = useState<string | undefined>();

  // 'allUsers' (Pseudo-Gruppe in den Claims jedes Benutzers) und
  // 'kostenersatz' (eine Funktions-Freischaltung, keine Feuerwehr) sind nie
  // ein Fahrtenbuch-Mandant — dieselbe Sperre steht in den Firestore-Regeln
  // und in `actionGroupMemberRequired`.
  const groups = useMemo(
    () =>
      myGroups.filter(
        (g): g is { id: string; name: string } =>
          !!g.id && !NON_TENANT_GROUP_IDS.includes(g.id),
      ),
    [myGroups],
  );

  const groupId = useMemo(() => {
    if (groups.length === 0) return undefined;
    if (manualGroupId && groups.some((g) => g.id === manualGroupId)) {
      return manualGroupId;
    }
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored && groups.some((g) => g.id === stored)) return stored;
    return groups[0].id;
  }, [groups, manualGroupId]);

  const setGroupId = useCallback(
    (id: string) => {
      // Never persist an id that isn't (or no longer is) one of the user's
      // groups — the memo above would fall back silently and the bad value
      // would linger in localStorage indefinitely.
      if (!groups.some((g) => g.id === id)) return;
      setManualGroupId(id);
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id);
    },
    [groups],
  );

  return { groups, groupId, setGroupId };
}
