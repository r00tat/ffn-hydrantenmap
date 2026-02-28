'use client';

import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { green, red } from '@mui/material/colors';
import React, { useCallback, useMemo, useState } from 'react';
import { UserRecordExtended } from '../../common/users';
import UserRecordExtendedDialog from '../../components/users/UserDialog';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useUpdateUser from '../../hooks/useUpdateUser';
import useUserList from '../../hooks/useUserList';
import { Group } from '../groups/groupTypes';
import { setUserPasswordAction } from './action';

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

export default function Users() {
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [editUser, setEditUser] = useState<UserRecordExtended>();
  const [users, fetchUsers] = useUserList();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
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

  const [filters, setFilters] = useState({
    name: '',
    email: '',
    feuerwehr: '',
    groups: [] as string[],
  });
  const [groupsMenuAnchor, setGroupsMenuAnchor] =
    useState<null | HTMLElement>(null);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (
        filters.name &&
        !(user.displayName || '')
          .toLowerCase()
          .includes(filters.name.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.email &&
        !(user.email || '').toLowerCase().includes(filters.email.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.feuerwehr &&
        !(user.feuerwehr || '')
          .toLowerCase()
          .includes(filters.feuerwehr.toLowerCase())
      ) {
        return false;
      }
      if (filters.groups.length > 0) {
        const userGroups = user.groups || [];
        if (!filters.groups.some((g) => userGroups.includes(g))) {
          return false;
        }
      }
      return true;
    });
  }, [users, filters]);

  const handleFilterChange = useCallback(
    (field: keyof typeof filters) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setFilters((prev) => ({ ...prev, [field]: event.target.value }));
        setPage(0);
      },
    []
  );

  const handleGroupFilterToggle = useCallback((groupId: string) => {
    setFilters((prev) => ({
      ...prev,
      groups: prev.groups.includes(groupId)
        ? prev.groups.filter((g) => g !== groupId)
        : [...prev.groups, groupId],
    }));
    setPage(0);
  }, []);

  const updateUser = useCallback(
    async (user: UserRecordExtended) => {
      console.info(`update user`);
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
    console.info(`edit user`);
    setShowEditUserDialog(true);
  }, []);

  const handleChangePage = useCallback((_event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    []
  );

  const paginatedUsers = useMemo(
    () =>
      filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredUsers, page, rowsPerPage]
  );

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
            <TextField
              size="small"
              placeholder="Filter..."
              value={filters.name}
              onChange={handleFilterChange('name')}
              fullWidth
              variant="outlined"
              sx={{ mt: 0.5 }}
            />
          </Grid>
          <Grid size={{ xs: 5, md: 6, lg: 2 }}>
            <b>Email</b>
            <TextField
              size="small"
              placeholder="Filter..."
              value={filters.email}
              onChange={handleFilterChange('email')}
              fullWidth
              variant="outlined"
              sx={{ mt: 0.5 }}
            />
          </Grid>

          <Grid size={{ xs: 6, md: 4, lg: 2 }}>
            <b>Feuerwehr</b>
            <TextField
              size="small"
              placeholder="Filter..."
              value={filters.feuerwehr}
              onChange={handleFilterChange('feuerwehr')}
              fullWidth
              variant="outlined"
              sx={{ mt: 0.5 }}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4, lg: 3 }}>
            <b>Gruppen</b>
            <Box sx={{ mt: 0.5 }}>
              <Tooltip title="Filter by groups">
                <IconButton
                  size="small"
                  onClick={(e) => setGroupsMenuAnchor(e.currentTarget)}
                >
                  <Badge
                    badgeContent={filters.groups.length}
                    color="primary"
                    invisible={filters.groups.length === 0}
                  >
                    <FilterListIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={groupsMenuAnchor}
                open={Boolean(groupsMenuAnchor)}
                onClose={() => setGroupsMenuAnchor(null)}
              >
                {Object.entries(groups).map(([id, name]) => (
                  <MenuItem
                    key={id}
                    onClick={() => handleGroupFilterToggle(id)}
                    dense
                  >
                    <Checkbox
                      checked={filters.groups.includes(id)}
                      size="small"
                    />
                    <ListItemText primary={name} />
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <hr />
          </Grid>
          {paginatedUsers.map((user) => (
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
              <Grid size={{ xs: 5, md: 6, lg: 2 }}>
                {user.email}{' '}
                <Typography color="error">
                  {!user.emailVerified && 'unverified'}
                </Typography>
              </Grid>

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
        <TablePagination
          component="div"
          count={filteredUsers.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelDisplayedRows={({ from, to, count }) =>
            `${from}-${to} of ${count}${count !== users.length ? ` (${users.length} total)` : ''}`
          }
        />
      </Box>
      {showEditUserDialog && editUser && (
        <UserRecordExtendedDialog
          user={editUser}
          groups={groups}
          onClose={async (user, newPassword) => {
            setShowEditUserDialog(false);
            if (user) {
              await updateUser(user);
              if (newPassword) {
                const result = await setUserPasswordAction(
                  user.uid,
                  newPassword
                );
                if (result.error) {
                  alert(result.error);
                }
              }
            }
          }}
        />
      )}
    </>
  );
}
