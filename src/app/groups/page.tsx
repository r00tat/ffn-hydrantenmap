'use client';

import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MuiLink from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { orderGroupsAsTree } from '../../common/groupHierarchy';
import { isTenantGroupId } from '../../common/tenantGroups';
import { effectiveGroupRoles } from '../../common/userGroupRoles';
import { UserRecordExtended } from '../../common/users';
import ConfirmDialog from '../../components/dialogs/ConfirmDialog';
import useGroupEditor from '../../components/groups/useGroupEditor';
import AdminGuard from '../../components/site/AdminGuard';
import { getUsers } from '../users/action';
import {
  createKnownGroupsAction,
  deleteGroupAction,
  getGroupsAction,
} from './GroupAction';
import { visibleGroupTree } from './groupTree';
import { Group, KNOWN_GROUPS } from './groupTypes';

function useGroupList(): [
  Group[],
  () => Promise<Group[]>,
  UserRecordExtended[]
] {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserRecordExtended[]>([]);
  const getGroups = useCallback(async () => {
    const [newGroups, newUsers] = await Promise.all([
      getGroupsAction(),
      getUsers(),
    ]);
    setGroups(newGroups);
    setUsers(newUsers);
    return newGroups;
  }, []);

  useEffect(() => {
    (async () => {
      await getGroups();
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
  const router = useRouter();
  const [groups, getGroups, users] = useGroupList();
  const [deleting, setDeleting] = useState<Group>();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { edit, dialog } = useGroupEditor({
    groups,
    users,
    onSaved: async () => {
      await getGroups();
    },
  });

  const missingKnownGroups = useMemo(() => {
    const existingIds = new Set(groups.map((g) => g.id));
    return KNOWN_GROUPS.filter((kg) => kg.id && !existingIds.has(kg.id));
  }, [groups]);

  const memberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const user of users) {
      for (const groupId of Object.keys(effectiveGroupRoles(user))) {
        counts[groupId] = (counts[groupId] ?? 0) + 1;
      }
    }
    return counts;
  }, [users]);

  const rows = useMemo(
    () => visibleGroupTree(orderGroupsAsTree(groups), search, collapsed),
    [groups, search, collapsed]
  );

  const toggleCollapsed = (groupId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const createKnownGroups = useCallback(async () => {
    await createKnownGroupsAction();
    await getGroups();
  }, [getGroups]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        <Tooltip title={t('refresh')}>
          <IconButton onClick={() => getGroups()} aria-label={t('refresh')}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        {missingKnownGroups.length > 0 && (
          <Tooltip
            title={t('createKnownTooltip', {
              names: missingKnownGroups.map((g) => g.name).join(', '),
            })}
          >
            <Button
              variant="outlined"
              startIcon={<PlaylistAddIcon />}
              onClick={createKnownGroups}
            >
              {t('createKnown')}
            </Button>
          </Tooltip>
        )}
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => edit({ name: '', description: '' })}
        >
          {t('add')}
        </Button>
      </Stack>

      <TextField
        size="small"
        fullWidth
        placeholder={t('search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
      />

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('cols.name')}</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                {t('cols.description')}
              </TableCell>
              <TableCell align="right">{t('cols.members')}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary">
                    {search ? t('noMatch') : t('empty')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ group, depth, hasChildren, expanded }) => {
              const href = `/groups/${encodeURIComponent(group.id ?? '')}`;
              const tenant = isTenantGroupId(group.id);
              return (
                <TableRow
                  key={group.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(href)}
                >
                  <TableCell>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        pl: depth * 3,
                      }}
                    >
                      {hasChildren ? (
                        <IconButton
                          size="small"
                          aria-label={
                            expanded
                              ? t('collapse', { name: group.name })
                              : t('expand', { name: group.name })
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            if (group.id) toggleCollapsed(group.id);
                          }}
                          // Bei aktiver Suche ist alles aufgeklappt.
                          disabled={!!search}
                        >
                          {expanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                        </IconButton>
                      ) : (
                        <Box sx={{ width: 34, flexShrink: 0 }} />
                      )}
                      <MuiLink
                        component={Link}
                        href={href}
                        underline="hover"
                        onClick={(e) => e.stopPropagation()}
                        sx={{ fontWeight: depth === 0 ? 600 : 400 }}
                      >
                        {group.name}
                      </MuiLink>
                      {!tenant && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={t('systemGroup')}
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell
                    sx={{
                      display: { xs: 'none', md: 'table-cell' },
                      color: 'text.secondary',
                    }}
                  >
                    {group.description}
                  </TableCell>
                  <TableCell align="right">
                    {tenant ? memberCounts[group.id ?? ''] ?? 0 : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={t('edit', { name: group.name })}>
                      <IconButton
                        size="small"
                        aria-label={t('edit', { name: group.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          edit(group);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('delete', { name: group.name })}>
                      <IconButton
                        size="small"
                        color="warning"
                        aria-label={t('delete', { name: group.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(group);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {dialog}

      {deleting && (
        <ConfirmDialog
          title={t('deleteTitle', { name: deleting.name || '' })}
          text={t('deleteConfirm', {
            name: deleting.name || '',
            description: deleting.description || '',
          })}
          onConfirm={async (confirmed) => {
            const group = deleting;
            setDeleting(undefined);
            if (confirmed && group.id) {
              await deleteGroupAction(group.id);
              await getGroups();
            }
          }}
        />
      )}
    </Container>
  );
}
