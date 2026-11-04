'use client';

import { useCallback, useMemo, useState } from 'react';
import { homeGroupFirst, selectDefaultGroupId } from '../common/homeGroup';
import { can, type Permission } from '../common/permissions';
import { NON_TENANT_GROUP_IDS } from '../common/tenantGroups';
import useFirebaseLogin from './useFirebaseLogin';

const STORAGE_KEY = 'fahrtenbuch.group';

/**
 * Gruppen des Benutzers plus die Vorauswahl: auf dieser Seite gewählt, sonst
 * die Heimatgruppe des Benutzers, sonst die zuletzt genutzte Gruppe aus dem
 * localStorage, sonst die erste Gruppe (`selectDefaultGroupId`). Die manuelle
 * Wahl gilt nur für die Seite — mit Heimatgruppe beginnt die nächste Seite
 * wieder dort (docs/berechtigungen.md, „Heimatgruppe").
 *
 * `groupId` wird direkt beim Rendern aus `groups` und der optionalen manuellen
 * Auswahl abgeleitet statt über einen Effekt nachgezogen — das vermeidet einen
 * zusätzlichen Render-Zyklus und das Lint-Problem "setState in effect"
 * (abgeleiteter Zustand sollte während des Renderns berechnet werden, siehe
 * https://react.dev/learn/you-might-not-need-an-effect).
 *
 * Mit `permission` stehen nur die Gruppen zur Auswahl, in denen der Benutzer
 * das Recht hat — etwa `kostenersatz.use` auf der Verrechnung. Sonst bliebe
 * eine Seite auf einer Gruppe stehen, deren Daten die Regeln gar nicht
 * herausgeben, und der Umschalter böte Gruppen an, die nur abgewiesen würden.
 */
export default function useFahrtenbuchGroup(permission?: Permission) {
  const { myGroups, isAdmin, groupRoles, homeGroup } = useFirebaseLogin();
  const [manualGroupId, setManualGroupId] = useState<string | undefined>();

  // 'allUsers' (Pseudo-Gruppe in den Claims jedes Benutzers) und
  // 'kostenersatz' (eine Funktions-Freischaltung, keine Feuerwehr) sind nie
  // ein Fahrtenbuch-Mandant — dieselbe Sperre steht in den Firestore-Regeln
  // und in `actionGroupMemberRequired`.
  const groups = useMemo(
    () =>
      homeGroupFirst(
        myGroups.filter(
          (g): g is { id: string; name: string } =>
            !!g.id &&
            !NON_TENANT_GROUP_IDS.includes(g.id) &&
            (!permission || can({ isAdmin, groupRoles }, g.id, permission)),
        ),
        homeGroup,
      ),
    [myGroups, permission, isAdmin, groupRoles, homeGroup],
  );

  const groupId = useMemo(
    () =>
      selectDefaultGroupId({
        groupIds: groups.map((g) => g.id),
        manualGroupId,
        homeGroup,
        storedGroupId:
          typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null,
      }),
    [groups, manualGroupId, homeGroup],
  );

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

  return { groups, groupId, setGroupId, homeGroup };
}
