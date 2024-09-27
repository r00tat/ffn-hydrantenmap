'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import {
  deleteGroupAction,
  getGroupsFromServer,
  Group,
  updateGroupFromServer,
} from './GroupAction';
import GroupDialog from './GroupDialog';

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

function useGroupList(): [Group[], () => Promise<Group[]>] {
  const [groups, setGroups] = useState<Group[]>([]);
  const getGroups = useCallback(async () => {
    const newGroups = await getGroupsFromServer();
    setGroups(newGroups);
    return newGroups;
  }, []);

  useEffect(() => {
    getGroups();
  }, [getGroups]);

  return [groups, getGroups];
}

export default function Users() {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group>();
  const [groups, getGroups] = useGroupList();

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

  const deleteAction = useCallback(async (group: Group) => {
    console.info(`delete group: ${JSON.stringify(group)}`);
    if (group.id) {
      await deleteGroupAction(group.id);
      await getGroups();
    }
  }, []);

  return (
    <>
      <Box sx={{ p: 2, height: '70vh' }}>
        <Typography variant="h3" gutterBottom>
          Groups
        </Typography>
        <Grid container>
          <Grid item xs={2} md={2} lg={2}></Grid>
          <Grid item xs={5} md={3} lg={3}>
            <b>ID</b>
          </Grid>
          <Grid item xs={5} md={3} lg={3}>
            <b>Name</b>
          </Grid>

          <Grid item xs={12} md={4} lg={4}>
            <b>Description</b>
          </Grid>
          <Grid item xs={12}>
            <hr />
          </Grid>

          {groups.map((group) => (
            <React.Fragment key={`group-${group.id}`}>
              <Grid item xs={2} md={2} lg={2}>
                <GroupRowButtons
                  row={group}
                  editFn={editAction}
                  deleteFn={showDeleteConfirm}
                />
              </Grid>
              <Grid item xs={5} md={3} lg={3}>
                {group.id}
              </Grid>
              <Grid item xs={5} md={3} lg={3}>
                {group.name}
              </Grid>

              <Grid item xs={12} md={4} lg={4}>
                {group.description}
              </Grid>
              <Grid item xs={12}>
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
          onClose={async (group) => {
            setShowEditDialog(false);
            if (group) {
              await updateGroupFromServer(group);
              await getGroups();
            }
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
