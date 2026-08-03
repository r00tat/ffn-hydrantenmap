'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { FahrtenbuchEntry } from '../../common/fahrtenbuch';
import { deleteFahrtenbuchEntry } from './fahrtenbuchActions';

/** Fehlerschlüssel, die die Server Action unverändert zurückgibt. */
const TRANSLATED_DELETE_ERRORS = [
  'notAllowed',
  'notInGroup',
  'entryDeleted',
] as const;

/**
 * Löschen eines Eintrags mit Rückfrage und übersetzter Fehlermeldung. Das
 * eigentliche Löschen macht ausschließlich die Server Action (Soft-Delete plus
 * Rechteprüfung) — der Client schreibt nie direkt in Firestore.
 */
export default function useEntryDeletion(groupId?: string) {
  const t = useTranslations('fahrtenbuch');
  // Die Gruppe steht mit im Zustand, damit die Meldung beim Gruppenwechsel
  // während des Renderns verfällt statt über einen Effekt aufgeräumt zu werden
  // (`react-hooks/set-state-in-effect`).
  const [errorState, setErrorState] = useState<{
    groupId?: string;
    message: string;
  }>();

  const deleteError =
    errorState && errorState.groupId === groupId
      ? errorState.message
      : undefined;

  const clearDeleteError = useCallback(() => setErrorState(undefined), []);

  const requestDelete = useCallback(
    async (entry: FahrtenbuchEntry) => {
      if (!groupId || !entry.id) return;
      if (!window.confirm(t('deleteConfirm'))) return;
      setErrorState(undefined);
      const result = await deleteFahrtenbuchEntry(groupId, entry.id);
      if (result.success) return;
      const known = TRANSLATED_DELETE_ERRORS.find((key) => key === result.error);
      setErrorState({
        groupId,
        message: known
          ? t(`errors.${known}` as 'errors.notInGroup')
          : t('errors.deleteFailed', { message: result.error ?? '' }),
      });
    },
    [groupId, t],
  );

  return { deleteError, clearDeleteError, requestDelete };
}
