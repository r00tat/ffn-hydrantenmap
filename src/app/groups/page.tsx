'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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
import { useSnackbar } from '../../components/providers/SnackbarProvider';
import AdminGuard from '../../components/site/AdminGuard';
import { getUsers } from '../users/action';
import {
  createKnownGroupsAction,
  deleteGroupAction,
  getGroupsAction,
  setGroupParentAction,
} from './GroupAction';
import {
  canDragGroup,
  dropTargetParent,
  groupDropId,
  ROOT_DROP_ID,
  visibleGroupTree,
  type VisibleGroupRow,
} from './groupTree';
import { Group, KNOWN_GROUPS } from './groupTypes';

function useGroupList(): [
  Group[],
  () => Promise<Group[]>,
  UserRecordExtended[],
  boolean,
] {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserRecordExtended[]>([]);
  // Bis zum ersten Laden ist die leere Liste nicht „keine Gruppen“.
  const [loaded, setLoaded] = useState(false);
  const getGroups = useCallback(async () => {
    const [newGroups, newUsers] = await Promise.all([getGroupsAction(), getUsers()]);
    setGroups(newGroups);
    setUsers(newUsers);
    setLoaded(true);
    return newGroups;
  }, []);

  useEffect(() => {
    (async () => {
      await getGroups();
    })();
  }, [getGroups]);

  return [groups, getGroups, users, loaded];
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
  const [groups, getGroups, users, loaded] = useGroupList();
  const [deleting, setDeleting] = useState<Group>();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string>();
  const showSnackbar = useSnackbar();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

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
    [groups, search, collapsed],
  );

  const toggleCollapsed = (groupId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const groupName = (groupId: string) => groups.find((g) => g.id === groupId)?.name ?? groupId;

  const onDragStart = ({ active }: DragStartEvent) => setDraggingId(String(active.id));

  // Auf eine Gruppe gezogen: wird deren Untergruppe; auf die Fläche oben:
  // oberste Ebene. Die Mitglieder kommen dabei in die neuen Elterngruppen.
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setDraggingId(undefined);
    const groupId = String(active.id);
    const parentId = dropTargetParent(groupId, over ? String(over.id) : undefined, groups);
    if (parentId === undefined) return;
    try {
      const { notMigrated } = await setGroupParentAction(groupId, parentId);
      showSnackbar(
        parentId
          ? t('moved', { name: groupName(groupId), parent: groupName(parentId) })
          : t('movedToRoot', { name: groupName(groupId) }),
        'success',
      );
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
          'warning',
        );
      }
    } catch (err) {
      console.error('Failed to move group:', err);
      showSnackbar(
        t('moveFailed', {
          message: err instanceof Error ? err.message : String(err),
        }),
        'error',
      );
    }
    await getGroups();
  };

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
        {loaded && missingKnownGroups.length > 0 && (
          <Tooltip
            title={t('createKnownTooltip', {
              names: missingKnownGroups.map((g) => g.name).join(', '),
            })}
          >
            <Button variant="outlined" startIcon={<PlaylistAddIcon />} onClick={createKnownGroups}>
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

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(undefined)}
      >
        <RootDropZone
          active={!!draggingId && dropTargetParent(draggingId, ROOT_DROP_ID, groups) !== undefined}
          label={t('dropRoot')}
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
              {!loaded && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <CircularProgress size={28} aria-label={t('loading')} />
                  </TableCell>
                </TableRow>
              )}
              {loaded && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary">
                      {search ? t('noMatch') : t('empty')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <GroupRow
                  key={row.group.id}
                  row={row}
                  memberCount={memberCounts[row.group.id ?? ''] ?? 0}
                  searching={!!search}
                  dropAllowed={
                    !!draggingId &&
                    dropTargetParent(draggingId, groupDropId(row.group.id ?? ''), groups) !==
                      undefined
                  }
                  dimmed={!!draggingId && draggingId !== row.group.id}
                  onOpen={(href) => router.push(href)}
                  onToggle={toggleCollapsed}
                  onEdit={edit}
                  onDelete={setDeleting}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <DragOverlay>
          {draggingId && (
            <Paper
              elevation={6}
              sx={{
                px: 2,
                py: 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <DragIndicatorIcon fontSize="small" />
              {groupName(draggingId)}
            </Paper>
          )}
        </DragOverlay>
      </DndContext>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {t('dragHint')}
      </Typography>

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

function RootDropZone({ active, label }: { active: boolean; label: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_DROP_ID,
    disabled: !active,
  });
  if (!active) return null;
  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      sx={{
        mb: 1,
        p: 1.5,
        textAlign: 'center',
        borderStyle: 'dashed',
        borderColor: isOver ? 'primary.main' : 'divider',
        bgcolor: isOver ? 'action.selected' : undefined,
        color: 'text.secondary',
      }}
    >
      {label}
    </Paper>
  );
}

interface GroupRowProps {
  row: VisibleGroupRow<Group>;
  memberCount: number;
  searching: boolean;
  /** Die gezogene Gruppe darf hier abgelegt werden. */
  dropAllowed: boolean;
  /** Während des Ziehens: keine gültige Ablage, blasser dargestellt. */
  dimmed: boolean;
  onOpen: (href: string) => void;
  onToggle: (groupId: string) => void;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
}

function GroupRow({
  row: { group, depth, hasChildren, expanded },
  memberCount,
  searching,
  dropAllowed,
  dimmed,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
}: GroupRowProps) {
  const t = useTranslations('groups');
  const id = group.id ?? '';
  const href = `/groups/${encodeURIComponent(id)}`;
  const tenant = isTenantGroupId(group.id);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: groupDropId(id),
    disabled: !dropAllowed,
  });
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id, disabled: !canDragGroup(id) });
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef],
  );

  return (
    <TableRow
      ref={setRef}
      hover
      sx={{
        cursor: 'pointer',
        opacity: isDragging ? 0.4 : dimmed && !dropAllowed ? 0.5 : 1,
        ...(isOver &&
          dropAllowed && {
            bgcolor: 'action.selected',
            outline: 2,
            outlineColor: 'primary.main',
            outlineOffset: -2,
          }),
      }}
      onClick={() => onOpen(href)}
    >
      <TableCell>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            pl: depth * 3,
          }}
        >
          {canDragGroup(id) ? (
            <Tooltip title={t('dragHandle', { name: group.name })}>
              <IconButton
                size="small"
                aria-label={t('dragHandle', { name: group.name })}
                sx={{ cursor: 'grab', touchAction: 'none' }}
                onClick={(e) => e.stopPropagation()}
                {...attributes}
                {...listeners}
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Box sx={{ width: 30, flexShrink: 0 }} />
          )}
          {hasChildren ? (
            <IconButton
              size="small"
              aria-label={
                expanded ? t('collapse', { name: group.name }) : t('expand', { name: group.name })
              }
              onClick={(e) => {
                e.stopPropagation();
                if (group.id) onToggle(group.id);
              }}
              // Bei aktiver Suche ist alles aufgeklappt.
              disabled={searching}
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
            <Chip size="small" variant="outlined" label={t('systemGroup')} sx={{ ml: 1 }} />
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
      <TableCell align="right">{tenant ? memberCount : '—'}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Tooltip title={t('edit', { name: group.name })}>
          <IconButton
            size="small"
            aria-label={t('edit', { name: group.name })}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(group);
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
              onDelete(group);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
