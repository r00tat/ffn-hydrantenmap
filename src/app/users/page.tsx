'use client';

import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { green, red } from '@mui/material/colors';
import { GridColDef } from '@mui/x-data-grid';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { feuerwehren } from '../../common/feuerwehren';
import { UserRecordExtended } from '../../common/users';
import UserRecordExtendedDialog from '../../components/users/UserDialog';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useUpdateUser from '../../hooks/useUpdateUser';
import useUserList from '../../hooks/useUserList';
import { Group } from '../groups/GroupAction';

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
      <Tooltip title={`Edit ${row.displayName || row.email} ${row.uid}`}>
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
  editAction: (user: UserRecordExtended) => void,
  groups: { [key: string]: string }
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
      {
        field: 'groups',
        headerName: 'Gruppen',
        minWidth: 100,
        renderCell: (params) =>
          (params.row.groups || [])
            .map((key: string) => groups[key])
            .filter((v: string) => v)
            .join(', '),
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
  }, [authorizeAction, editAction, groups]);
  return columns;
}

export default function Users() {
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [editUser, setEditUser] = useState<UserRecordExtended>();
  const [users, fetchUsers] = useUserList();
  const updateApiCall = useUpdateUser();

  const groupsArray = useFirebaseCollection<Group>({
    collectionName: 'groups',
    // pathSegments: [firecallId, 'group'],
    // queryConstraints: [orderBy('timestamp', order)],
  });

  const groups: { [key: string]: string } = useMemo(
    () =>
      Object.fromEntries(
        groupsArray
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((g) => [g.id, g.name])
      ),
    [groupsArray]
  );

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
      updateUser({
        ...user,
        authorized: !user.authorized,
      } as UserRecordExtended);
    },
    [updateUser]
  );
  const editAction = useCallback(async (user: UserRecordExtended) => {
    setEditUser(user);
    console.info(`edit user: ${JSON.stringify(user)}`);
    setShowEditUserDialog(true);
  }, []);
  const columns = useGridColumns(authorizeAction, editAction, groups);
  return (
    <>
      <Box sx={{ p: 2, height: '70vh' }}>
        <Typography variant="h3" gutterBottom>
          Users{' '}
          <IconButton onClick={() => fetchUsers()}>
            <RefreshIcon />
          </IconButton>
        </Typography>
        <Grid container>
          <Grid size={{ xs: 2, md: 2, lg: 2 }}></Grid>
          <Grid size={{ xs: 5, md: 6, lg: 2 }}>
            <b>Name</b>
          </Grid>
          <Grid size={{ xs: 5, md: 6, lg: 2 }}>
            <b>Email</b>
          </Grid>

          <Grid size={{ xs: 6, md: 4, lg: 2 }}>
            <b>Feuerwehr</b>
          </Grid>
          <Grid size={{ xs: 6, md: 4, lg: 3 }}>
            <b>Gruppen</b>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <hr />
          </Grid>
          {users.map((user) => (
            <React.Fragment key={`user-entry-${user.uid}`}>
              <Grid size={{ xs: 2, md: 2, lg: 2 }}>
                <UserRowButtons
                  row={user}
                  authorizeFn={authorizeAction}
                  editFn={editAction}
                />
              </Grid>
              <Grid size={{ xs: 5, md: 6, lg: 2 }}>
                {user.displayName || ''}
              </Grid>
              <Grid size={{ xs: 5, md: 6, lg: 2 }}>{user.email}</Grid>

              <Grid size={{ xs: 6, md: 4, lg: 2 }}>
                {user.feuerwehr} {user.description}
              </Grid>
              <Grid size={{ xs: 6, md: 4, lg: 3 }}>
                {(user.groups || [])
                  .map((key: string) => groups[key])
                  .filter((v: string) => v)
                  .join(', ')}
              </Grid>
              <Grid size={{ xs: 12 }}>
                <hr />
              </Grid>
            </React.Fragment>
          ))}
        </Grid>

        {/* <DataGrid rows={users} columns={columns} getRowId={(row) => row.uid} /> */}
      </Box>
      {showEditUserDialog && editUser && (
        <UserRecordExtendedDialog
          user={editUser}
          groups={groups}
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
