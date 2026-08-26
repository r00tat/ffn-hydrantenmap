'use client';

import { useCallback, useMemo } from 'react';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import useFahrtenbuchPersons from '../../hooks/useFahrtenbuchPersons';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { canModifyEntry, type EntryModifyActor } from './entryPermissions';
import { isFahrtenbuchManager } from './managerPermissions';

/**
 * Die Frage „darf ich diesen Eintrag ändern?" für die Liste — damit ein
 * Bearbeiten-Knopf nur dort erscheint, wo das Speichern auch durchgeht.
 *
 * Dieselbe Rechnung wie in `mayModifyEntry` auf dem Server, mit denselben
 * Eingaben: Verwalterrecht aus der Sitzung, Ersteller-Vergleich über die UID
 * und — bei Einträgen aus dem Freigabe-Link — der Fahrer über die mit seinem
 * Benutzerkonto verknüpfte Person. Die Personenliste ist hier ohnehin
 * abonniert, die Verknüpfung kostet also nichts extra.
 *
 * Das ist Bedienkomfort, keine Sicherheitsgrenze — die steht in den Actions.
 * Ohne geladene Gruppe fällt die Antwort auf „nein": Solange nicht bekannt
 * ist, wer der Aufrufer in welcher Gruppe ist, wäre ein angebotener Knopf eine
 * Behauptung, die der Server gleich widerlegt.
 */
export default function useEntryPermissions(groupId?: string) {
  const { uid, isAdmin, groups, fahrtenbuchGeraetemeister } =
    useFirebaseLogin();
  const { persons } = useFahrtenbuchPersons(groupId);

  const canManage = useMemo(
    () =>
      !!groupId &&
      isFahrtenbuchManager(groupId, {
        isAdmin,
        groups,
        fahrtenbuchGeraetemeister,
      }),
    [groupId, isAdmin, groups, fahrtenbuchGeraetemeister],
  );

  const actor = useMemo<EntryModifyActor>(
    () => ({
      userId: uid,
      personIds: persons
        .filter((person) => !!uid && person.userIds?.includes(uid))
        .map((person) => person.id)
        .filter((id): id is string => !!id),
    }),
    [uid, persons],
  );

  const canModify = useCallback(
    (entry: FahrtenbuchEntry) =>
      !!groupId && !!uid && canModifyEntry(entry, actor, canManage),
    [groupId, uid, actor, canManage],
  );

  return { canModify, canManage };
}
