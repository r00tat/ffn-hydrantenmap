import { Box, Button, Typography } from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';
import useUserList from '../hooks/useUserList';
import { DataGrid, GridApi, GridCellValue, GridColDef } from '@mui/x-data-grid';
import { UserRecordExtended } from './api/users';
import useUpdateUser from '../hooks/useUpdateUser';

function useGridColumns(
  authorizeAction: (user: UserRecordExtended) => Promise<void>
) {
  const [columns, setColumns] = useState<GridColDef[]>([]);

  useEffect(() => {
    setColumns([
      { field: 'uid', headerName: 'UID', minWidth: 150, flex: 0.3 },
      { field: 'email', headerName: 'Email', minWidth: 200, flex: 1 },
      { field: 'displayName', headerName: 'Name', minWidth: 150, flex: 1 },
      { field: 'disabled', headerName: 'disabled', minWidth: 100 },
      { field: 'authorized', headerName: 'authorized', minWidth: 100 },
      {
        field: 'action',
        headerName: 'Action',
        sortable: false,
        renderCell: (params) => {
          // console.info(`cell params: %j`, params);
          const onClick = (e: any) => {
            e.stopPropagation(); // don't select this row after clicking
            // console.info(`this row: %j`, JSON.stringify(params.row, null, 4))
            authorizeAction(params.row);
          };

          return (
            <Button onClick={onClick}>
              {params.row.authorized ? 'De-Authorize' : 'Authorize'}
            </Button>
          );
        },
      },
    ]);
  }, [authorizeAction]);
  return columns;
}

export default function Users() {
  const [users, fetchUsers] = useUserList();
  const updateApiCall = useUpdateUser();
  const updateUser = useCallback(
    async (user: UserRecordExtended) => {
      user.authorized = !user.authorized;
      console.info(`update user: ${JSON.stringify(user)}`);
      await updateApiCall(user);
      await fetchUsers();
    },
    [fetchUsers, updateApiCall]
  );
  const columns = useGridColumns(updateUser);
  return (
    <Box sx={{ p: 2, height: '70vh' }}>
      <Typography variant="h3" gutterBottom>
        Users
      </Typography>
      <DataGrid rows={users} columns={columns} getRowId={(row) => row.uid} />
    </Box>
  );
}
