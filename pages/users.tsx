import { Box, Typography } from '@mui/material';
import React from 'react';
import useUserList from '../hooks/useUserList';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  { field: 'uid', headerName: 'UID', minWidth: 150, flex: 0.3 },
  { field: 'email', headerName: 'Email', minWidth: 200, flex: 1 },
  { field: 'displayName', headerName: 'Name', minWidth: 150, flex: 1 },
  { field: 'disabled', headerName: 'disabled', minWidth: 100 },
];

export default function Users() {
  const users = useUserList();
  return (
    <Box sx={{ p: 2, height: '70vh' }}>
      <Typography variant="h3" gutterBottom>
        Users
      </Typography>
      <DataGrid rows={users} columns={columns} getRowId={(row) => row.uid} />
    </Box>
  );
}
