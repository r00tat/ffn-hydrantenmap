'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { updateGroupAction } from '../../app/groups/GroupAction';
import GroupDialog from '../../app/groups/GroupDialog';
import type { Group } from '../../app/groups/groupTypes';
import type { UserRecordExtended } from '../../common/users';
import { useSnackbar } from '../providers/SnackbarProvider';

interface GroupEditorOptions {
  groups: Group[];
  users: UserRecordExtended[];
  /** Nach dem Speichern, mit der ID der gespeicherten Gruppe. */
  onSaved: (groupId: string) => Promise<void> | void;
}

/**
 * Gruppendialog samt Speichern — gemeinsam für die Gruppenübersicht und die
 * Detailseite einer Gruppe. Nur für den globalen Admin: `updateGroupAction`
 * verlangt ihn ohnehin.
 */
export default function useGroupEditor({
  groups,
  users,
  onSaved,
}: GroupEditorOptions) {
  const t = useTranslations('groups');
  const showSnackbar = useSnackbar();
  const [editing, setEditing] = useState<Group>();

  const edit = useCallback((group: Group) => setEditing(group), []);

  const onClose = async (
    group?: Group,
    assignedUsers?: string[],
    groupAdmins?: string[]
  ) => {
    setEditing(undefined);
    if (!group || !assignedUsers) return;

    // Eine Gruppe ohne ID ist neu: updateGroupAction legt sie an und liefert
    // die ID. Danach öffnet der Dialog sie erneut, damit die Abschnitte für
    // Alarm-SMS und ÖBFV-Token, die eine ID brauchen, bedienbar werden.
    const wasNew = !group.id;
    try {
      const { groupId, notMigrated } = await updateGroupAction(
        group,
        assignedUsers,
        groupAdmins || []
      );
      if (notMigrated.length > 0) {
        showSnackbar(
          t('notMigrated', {
            names: notMigrated
              .map((uid) => {
                const u = users.find((user) => user.uid === uid);
                return u?.displayName || u?.email || uid;
              })
              .join(', '),
          }),
          'warning'
        );
      }
      await onSaved(groupId);
      if (wasNew && groupId) setEditing({ ...group, id: groupId });
    } catch (err) {
      console.error('Failed to save group:', err);
      showSnackbar(
        t('saveFailed', {
          message: err instanceof Error ? err.message : String(err),
        }),
        'error'
      );
    }
  };

  const dialog = editing ? (
    <GroupDialog
      // Neu einhängen je Gruppe, sonst bliebe der Stand der vorigen stehen.
      key={editing.id ?? 'new'}
      group={editing}
      users={users}
      groups={groups}
      onClose={onClose}
    />
  ) : null;

  return { edit, dialog };
}
