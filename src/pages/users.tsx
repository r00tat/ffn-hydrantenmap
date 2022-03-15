import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { Box, Typography } from '@mui/material';
import { green, red } from '@mui/material/colors';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useState } from 'react';
import { feuerwehren } from '../common/feuerwehren';
import { UserRecordExtended } from '../common/users';
import UserRecordExtendedDialog from '../components/users/UserDialog';
import useUpdateUser from '../hooks/useUpdateUser';
import useUserList from '../hooks/useUserList';

interface UserRowButtonParams {
  row: UserRecordExtended;
  authorizeFn: (user: UserRecordExtended) => Promise<void>;
  editFn: (user: UserRecordExtended) => void;
}
function UserRowButtons({ row, authorizeFn, editFn }: UserRowButtonParams) {
  return (
    <>
      <Tooltip title={row.authorized ? 'De-Authorize' : 'Authorize'}>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            authorizeFn(row);
          }}
        >
          {row.authorized ? (
            <CheckIcon sx={{ color: green[500] }} />
          ) : (
            <BlockIcon sx={{ color: red[500] }} />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip title={`Edit ${row.displayName}`}>
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

function useGridColumns(
  authorizeAction: (user: UserRecordExtended) => Promise<void>,
  editAction: (user: UserRecordExtended) => void
) {
  const [columns, setColumns] = useState<GridColDef[]>([]);

  useEffect(() => {
    setColumns([
      // { field: 'uid', headerName: 'UID', minWidth: 150, flex: 0.3 },
      { field: 'displayName', headerName: 'Name', minWidth: 150, flex: 1 },
      { field: 'email', headerName: 'Email', minWidth: 200, flex: 1 },
      {
        field: 'feuerwehr',
        headerName: 'Feuerwehr',
        minWidth: 100,
        flex: 0.5,
        renderCell: (params) => feuerwehren[params.row.feuerwehr]?.name || '',
      },
      { field: 'disabled', headerName: 'disabled', minWidth: 100 },
      // { field: 'authorized', headerName: 'authorized', minWidth: 100 },
      {
        field: 'action',
        headerName: 'Action',
        sortable: false,
        renderCell: (params) => (
          <UserRowButtons
            row={params.row}
            authorizeFn={authorizeAction}
            editFn={editAction}
          />
        ),
      },
    ]);
  }, [authorizeAction, editAction]);
  return columns;
}

export default function Users() {
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [editUser, setEditUser] = useState<UserRecordExtended>();
  const [users, fetchUsers] = useUserList();
  const updateApiCall = useUpdateUser();

  const updateUser = useCallback(
    async (user: UserRecordExtended) => {
      console.info(`update user: ${JSON.stringify(user)}`);
      await updateApiCall(user);
      await fetchUsers();
    },
    [fetchUsers, updateApiCall]
  );

  const authorizeAction = useCallback(
    async (user: UserRecordExtended) => {
      user.authorized = !user.authorized;
      updateUser(user);
    },
    [updateUser]
  );
  const editAction = useCallback(async (user: UserRecordExtended) => {
    setEditUser(user);
    console.info(`edit user: ${JSON.stringify(user)}`);
    setShowEditUserDialog(true);
  }, []);
  const columns = useGridColumns(authorizeAction, editAction);
  return (
    <>
      <Box sx={{ p: 2, height: '70vh' }}>
        <Typography variant="h3" gutterBottom>
          Users
        </Typography>
        <DataGrid rows={users} columns={columns} getRowId={(row) => row.uid} />
      </Box>
      {showEditUserDialog && editUser && (
        <UserRecordExtendedDialog
          user={editUser}
          onClose={(user) => {
            setShowEditUserDialog(false);
            if (user) {
              updateUser(user);
            }
          }}
        />
      )}
    </>
  );
}
