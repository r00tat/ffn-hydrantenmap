'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserRecordExtended } from '../../common/users';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import { getUsers } from '../users/action';
import {
  createKnownGroupsAction,
  deleteGroupAction,
  getGroupsAction,
  updateGroupAction,
} from './GroupAction';
import GroupDialog from './GroupDialog';
import { Group, KNOWN_GROUPS } from './groupTypes';

interface UserRowButtonParams {
  row: Group;

  editFn: (group: Group) => void;
  deleteFn: (group: Group) => void;
}
function GroupRowButtons({ row, editFn, deleteFn }: UserRowButtonParams) {
  return (
    <>
      <Tooltip title={`Edit ${row.name}`}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            editFn(row);
          }}
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Delete ${row.name}`}>
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

export default function Groups() {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group>();
  const [groups, getGroups, users] = useGroupList();

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
          Groups
          <IconButton onClick={() => getGroups()}>
            <RefreshIcon />
          </IconButton>
          {missingKnownGroups.length > 0 && (
            <Tooltip
              title={`Fehlende Gruppen anlegen: ${missingKnownGroups.map((g) => g.name).join(', ')}`}
            >
              <Button
                variant="outlined"
                size="small"
                startIcon={<PlaylistAddIcon />}
                onClick={createKnownGroups}
                sx={{ ml: 2 }}
              >
                Standardgruppen anlegen
              </Button>
            </Tooltip>
          )}
        </Typography>
        <Grid container>
          <Grid size={{ xs: 2, md: 2, lg: 2 }}></Grid>
          <Grid size={{ xs: 5, md: 3, lg: 3 }}>
            <b>ID</b>
          </Grid>
          <Grid size={{ xs: 5, md: 3, lg: 3 }}>
            <b>Name</b>
          </Grid>

          <Grid size={{ xs: 12, md: 4, lg: 4 }}>
            <b>Description</b>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <hr />
          </Grid>

          {groups.map((group) => (
            <React.Fragment key={`group-${group.id}`}>
              <Grid size={{ xs: 2, md: 2, lg: 2 }}>
                <GroupRowButtons
                  row={group}
                  editFn={editAction}
                  deleteFn={showDeleteConfirm}
                />
              </Grid>
              <Grid size={{ xs: 5, md: 3, lg: 3 }}>{group.id}</Grid>
              <Grid size={{ xs: 5, md: 3, lg: 3 }}>{group.name}</Grid>

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
          onClose={async (group, assigendUsers) => {
            setShowEditDialog(false);
            if (group && assigendUsers) {
              await updateGroupAction(group, assigendUsers);
            }
            await getGroups();
          }}
        />
      )}

      {isConfirmOpen && editGroup && (
        <ConfirmDialog
          title={`${editGroup?.name} löschen`}
          text={`${editGroup?.name} ${editGroup?.description} wirklich löschen?`}
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
