'use client';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useState } from 'react';
import GroupDialog from './GroupDialog';
import { getGroupsFromServer, Group, updateGroup } from './GroupAction';

interface UserRowButtonParams {
  row: Group;

  editFn: (user: Group) => void;
}
function GroupRowButtons({ row, editFn }: UserRowButtonParams) {
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
    </>
  );
}

function useGridColumns(editAction: (user: Group) => void) {
  const [columns, setColumns] = useState<GridColDef[]>([]);

  useEffect(() => {
    setColumns([
      { field: 'id', headerName: 'ID', minWidth: 150, flex: 0.3 },
      { field: 'name', headerName: 'Name', minWidth: 150, flex: 1 },
      {
        field: 'description',
        headerName: 'Description',
        minWidth: 100,
        flex: 1,
      },
      {
        field: 'action',
        headerName: 'Action',
        sortable: false,
        renderCell: (params) => (
          <GroupRowButtons row={params.row} editFn={editAction} />
        ),
      },
    ]);
  }, [editAction]);
  return columns;
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
  const [editGroup, setEditGroup] = useState<Group>();
  const [groups, getGroups] = useGroupList();

  const editAction = useCallback(async (user: Group) => {
    setEditGroup(user);
    console.info(`edit group: ${JSON.stringify(user)}`);
    setShowEditDialog(true);
  }, []);
  const columns = useGridColumns(editAction);
  return (
    <>
      <Box sx={{ p: 2, height: '70vh' }}>
        <Typography variant="h3" gutterBottom>
          Groups
        </Typography>
        <DataGrid rows={groups} columns={columns} getRowId={(row) => row.id} />
      </Box>
      {showEditDialog && editGroup && (
        <GroupDialog
          group={editGroup}
          onClose={async (group) => {
            setShowEditDialog(false);
            if (group) {
              await updateGroup(group);
              await getGroups();
            }
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
