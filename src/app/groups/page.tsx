'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserRecordExtended } from '../../common/users';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import { useSnackbar } from '../../components/providers/SnackbarProvider';
import AdminGuard from '../../components/site/AdminGuard';
import { getUsers } from '../users/action';
import {
  createKnownGroupsAction,
  deleteGroupAction,
  getGroupsAction,
  updateGroupAction,
} from './GroupAction';
import GroupDialog from './GroupDialog';
import { Group, KNOWN_GROUPS } from './groupTypes';
import { orderGroupsAsTree } from '../../common/groupHierarchy';
import { isTenantGroupId } from '../../common/tenantGroups';

interface UserRowButtonParams {
  row: Group;
  editFn: (group: Group) => void;
  deleteFn: (group: Group) => void;
}
function GroupRowButtons({ row, editFn, deleteFn }: UserRowButtonParams) {
  const t = useTranslations('groups');
  return (
    <>
      {/* Rollen gibt es nur in Mandanten, nicht in allUsers/kostenersatz. */}
      {row.id && isTenantGroupId(row.id) && (
        <Tooltip title={t('roles', { name: row.name })}>
          <IconButton
            component={Link}
            href={`/groups/${encodeURIComponent(row.id)}/rollen`}
            onClick={(e) => e.stopPropagation()}
          >
            <ManageAccountsIcon />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={t('edit', { name: row.name })}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            editFn(row);
          }}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('delete', { name: row.name })}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            deleteFn(row);
          }}
          color="warning"
        >
          <DeleteIcon />
        </IconButton>
      </Tooltip>
    </>
  );
}

function useGroupList(): [
  Group[],
  () => Promise<Group[]>,
  UserRecordExtended[]
] {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserRecordExtended[]>([]);
  const getGroups = useCallback(async () => {
    const newGroups = await getGroupsAction();
    const users = await getUsers();
    setGroups(newGroups);
    setUsers(users);
    return newGroups;
  }, []);

  useEffect(() => {
    (async () => {
      getGroups();
    })();
  }, [getGroups]);

  return [groups, getGroups, users];
}

export default function GroupsPage() {
  return (
    <AdminGuard>
      <Groups />
    </AdminGuard>
  );
}

function Groups() {
  const t = useTranslations('groups');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group>();
  const [groups, getGroups, users] = useGroupList();
  const showSnackbar = useSnackbar();

  const groupTree = useMemo(() => orderGroupsAsTree(groups), [groups]);

  const missingKnownGroups = useMemo(() => {
    const existingIds = new Set(groups.map((g) => g.id));
    return KNOWN_GROUPS.filter((kg) => kg.id && !existingIds.has(kg.id));
  }, [groups]);

  const createKnownGroups = useCallback(async () => {
    const created = await createKnownGroupsAction();
    if (created.length > 0) {
      console.info(`Created known groups: ${created.join(', ')}`);
    }
    await getGroups();
  }, [getGroups]);

  const editAction = useCallback(async (group: Group) => {
    setEditGroup(group);
    console.info(`edit group: ${JSON.stringify(group)}`);
    setShowEditDialog(true);
  }, []);
  const showDeleteConfirm = useCallback(async (group: Group) => {
    setEditGroup(group);
    console.info(`confirm group delete: ${JSON.stringify(group)}`);
    setIsConfirmOpen(true);
  }, []);

  const deleteAction = useCallback(
    async (group: Group) => {
      console.info(`delete group: ${JSON.stringify(group)}`);
      if (group.id) {
        await deleteGroupAction(group.id);
        await getGroups();
      }
    },
    [getGroups]
  );

  return (
    <>
      <Box sx={{ p: 2, height: '70vh' }}>
        <Typography variant="h3" gutterBottom>
          {t('title')}
          <IconButton onClick={() => getGroups()}>
            <RefreshIcon />
          </IconButton>
          {missingKnownGroups.length > 0 && (
            <Tooltip
              title={t('createKnownTooltip', {
                names: missingKnownGroups.map((g) => g.name).join(', '),
              })}
            >
              <Button
                variant="outlined"
                size="small"
                startIcon={<PlaylistAddIcon />}
                onClick={createKnownGroups}
                sx={{ ml: 2 }}
              >
                {t('createKnown')}
              </Button>
            </Tooltip>
          )}
        </Typography>
        <Grid container>
          <Grid size={{ xs: 2, md: 2, lg: 2 }}></Grid>
          <Grid size={{ xs: 5, md: 3, lg: 3 }}>
            <b>{t('cols.id')}</b>
          </Grid>
          <Grid size={{ xs: 5, md: 3, lg: 3 }}>
            <b>{t('cols.name')}</b>
          </Grid>

          <Grid size={{ xs: 12, md: 4, lg: 4 }}>
            <b>{t('cols.description')}</b>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <hr />
          </Grid>

          {groupTree.map(({ group, depth }) => (
            <React.Fragment key={`group-${group.id}`}>
              <Grid size={{ xs: 2, md: 2, lg: 2 }}>
                <GroupRowButtons
                  row={group}
                  editFn={editAction}
                  deleteFn={showDeleteConfirm}
                />
              </Grid>
              <Grid size={{ xs: 5, md: 3, lg: 3 }}>{group.id}</Grid>
              <Grid size={{ xs: 5, md: 3, lg: 3 }}>
                {/* Untergruppen eingerückt unter ihrer Elterngruppe. */}
                <Box component="span" sx={{ pl: depth * 2 }}>
                  {depth > 0 && '└ '}
                  {group.name}
                </Box>
              </Grid>

              <Grid size={{ xs: 12, md: 4, lg: 4 }}>{group.description}</Grid>
              <Grid size={{ xs: 12 }}>
                <hr />
              </Grid>
            </React.Fragment>
          ))}
        </Grid>

        {/* <DataGrid rows={groups} columns={columns} getRowId={(row) => row.id} /> */}
      </Box>
      {showEditDialog && editGroup && (
        <GroupDialog
          group={editGroup}
          users={users}
          groups={groups}
          onClose={async (group, assigendUsers, groupAdmins) => {
            setShowEditDialog(false);
            if (group && assigendUsers) {
              // A group without an id is new: updateGroupAction creates it and
              // returns the generated id. Reopen the freshly created group in
              // edit mode so the integration sections (Alarm-SMS / ÖBFV-Token),
              // which require an existing group id, become available.
              const wasNew = !group.id;
              const { groupId: savedId, notMigrated } =
                await updateGroupAction(group, assigendUsers, groupAdmins || []);
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
              await getGroups();
              if (wasNew && savedId) {
                setEditGroup({ ...group, id: savedId });
                setShowEditDialog(true);
              }
            } else {
              await getGroups();
            }
          }}
        />
      )}

      {isConfirmOpen && editGroup && (
        <ConfirmDialog
          title={t('deleteTitle', { name: editGroup?.name || '' })}
          text={t('deleteConfirm', {
            name: editGroup?.name || '',
            description: editGroup?.description || '',
          })}
          onConfirm={(confirmed) => {
            if (confirmed) {
              deleteAction(editGroup);
            }
            setIsConfirmOpen(false);
          }}
        />
      )}

      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => {
          setShowEditDialog(true);
          setEditGroup({
            name: '',
            description: '',
          });
        }}
      >
        <AddIcon />
      </Fab>
    </>
  );
}
