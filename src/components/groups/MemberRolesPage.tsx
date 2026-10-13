'use client';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
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
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { can, ROLE_IDS, ROLES, type RoleId } from '../../common/permissions';
import { isTenantGroupId } from '../../common/tenantGroups';
import { getGroupsAction } from '../../app/groups/GroupAction';
import type { Group } from '../../app/groups/groupTypes';
import {
  addMemberAction,
  getMemberRolesAction,
  removeMemberAction,
  setMemberRoleAction,
  type MemberRolesData,
  type MemberRolesError,
} from '../../app/groups/memberRolesActions';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useCan } from '../../hooks/usePermissions';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import type { MemberCandidate, MemberRow } from './memberRoles';

type Feedback = { severity: 'success' | 'error'; text: string };

/**
 * Mitglieder und Rollen einer Gruppe: eine Matrix Mitglied × Rolle.
 *
 * Erreichbar mit `rollen.assign` in der Gruppe (Gruppen-Admin, globaler
 * Admin). Welche Kästchen bedienbar sind, liefert der Server mit
 * (`canAssignRole`); er prüft beim Speichern ohnehin erneut. Mitglieder
 * aufnehmen und entfernen darf nur der globale Admin.
 */
export default function MemberRolesPage({ groupId }: { groupId: string }) {
  const t = useTranslations('groupRoles');
  const router = useRouter();
  const allowed = useCan(groupId, 'rollen.assign');
  const { isAdmin, groupRoles } = useFirebaseLogin();

  const [groups, setGroups] = useState<Group[]>([]);
  const [data, setData] = useState<MemberRolesData | undefined>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | undefined>();
  const [candidate, setCandidate] = useState<MemberCandidate | null>(null);
  const [removing, setRemoving] = useState<MemberRow | undefined>();

  const errorText = useCallback(
    (error: MemberRolesError | unknown) => {
      if (typeof error === 'string') {
        return t(`errors.${error as MemberRolesError}`);
      }
      return t('errors.unknown', {
        message: error instanceof Error ? error.message : String(error),
      });
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMemberRolesAction(groupId));
    } catch (err) {
      setData(undefined);
      setFeedback({ severity: 'error', text: errorText(err) });
    } finally {
      setLoading(false);
    }
  }, [groupId, errorText]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    getGroupsAction()
      .then((all) => active && setGroups(all))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [allowed]);

  // Zur Auswahl stehen nur Gruppen, in denen der Benutzer Rollen vergeben darf.
  const switchable = useMemo(
    () =>
      groups.filter(
        (g) =>
          !!g.id &&
          isTenantGroupId(g.id) &&
          can({ isAdmin, groupRoles }, g.id, 'rollen.assign'),
      ),
    [groups, isAdmin, groupRoles],
  );

  const toggleRole = async (row: MemberRow, role: RoleId, enabled: boolean) => {
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await setMemberRoleAction(groupId, row.uid, role, enabled);
      if (!result.success) {
        setFeedback({ severity: 'error', text: errorText(result.error) });
        return;
      }
      setData((prev) =>
        prev && {
          ...prev,
          members: prev.members.map((m) =>
            m.uid === row.uid ? { ...m, roles: result.roles, migrated: true } : m,
          ),
        },
      );
    } catch (err) {
      setFeedback({ severity: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!candidate) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await addMemberAction(groupId, candidate.uid);
      if (!result.success) {
        setFeedback({ severity: 'error', text: errorText(result.error) });
        return;
      }
      setCandidate(null);
      setFeedback({
        severity: 'success',
        text: t('memberAdded', { name: candidate.displayName }),
      });
      await load();
    } catch (err) {
      setFeedback({ severity: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (row: MemberRow) => {
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await removeMemberAction(groupId, row.uid);
      if (!result.success) {
        setFeedback({ severity: 'error', text: errorText(result.error) });
        return;
      }
      setFeedback({
        severity: 'success',
        text: t('memberRemoved', { name: row.displayName }),
      });
      await load();
    } catch (err) {
      setFeedback({ severity: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography variant="h4" gutterBottom>
          {t('title')}
        </Typography>
        <Typography color="text.secondary">{t('noAccess')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        <TextField
          select
          size="small"
          label={t('group')}
          value={switchable.some((g) => g.id === groupId) ? groupId : ''}
          onChange={(e) => router.push(`/groups/${e.target.value}/rollen`)}
          disabled={switchable.length === 0}
          sx={{ minWidth: 220 }}
        >
          {switchable.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {g.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {data && (
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
          {t('intro', { group: data.groupName })}
        </Typography>
      )}

      {feedback && (
        <Alert
          severity={feedback.severity}
          onClose={() => setFeedback(undefined)}
          sx={{ mb: 2 }}
        >
          {feedback.text}
        </Alert>
      )}

      {loading && !data && <CircularProgress />}

      {data && (
        <>
          {data.canManageMembers && (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ mb: 2, alignItems: { sm: 'center' } }}
            >
              <Autocomplete
                sx={{ minWidth: 320 }}
                size="small"
                options={data.candidates}
                value={candidate}
                onChange={(_, value) => setCandidate(value)}
                getOptionLabel={(c) =>
                  c.email && c.email !== c.displayName
                    ? `${c.displayName} (${c.email})`
                    : c.displayName
                }
                isOptionEqualToValue={(a, b) => a.uid === b.uid}
                renderInput={(params) => (
                  <TextField {...params} label={t('addMemberLabel')} />
                )}
              />
              <Button
                variant="outlined"
                startIcon={<PersonAddIcon />}
                disabled={!candidate || busy}
                onClick={addMember}
              >
                {t('addMember')}
              </Button>
            </Stack>
          )}

          {data.members.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t('noMembers')}
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('member')}</TableCell>
                    {ROLE_IDS.map((role) => (
                      <TableCell key={role} align="center">
                        {t(`roles.${role}.name`)}
                      </TableCell>
                    ))}
                    {data.canManageMembers && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.members.map((row) => (
                    <TableRow key={row.uid} hover>
                      <TableCell>
                        <Typography variant="body2" component="div">
                          {row.displayName}
                          {!row.migrated && (
                            <Tooltip title={t('notMigratedHint')}>
                              <Chip
                                size="small"
                                label={t('notMigrated')}
                                sx={{ ml: 1 }}
                              />
                            </Tooltip>
                          )}
                        </Typography>
                        {row.email && row.email !== row.displayName && (
                          <Typography variant="caption" color="text.secondary">
                            {row.email}
                          </Typography>
                        )}
                      </TableCell>
                      {ROLE_IDS.map((role) => {
                        const checked = row.roles.includes(role);
                        const assignable = data.assignable[role];
                        const label = t('toggleRole', {
                          role: t(`roles.${role}.name`),
                          name: row.displayName,
                        });
                        return (
                          <TableCell key={role} align="center">
                            <Tooltip
                              title={assignable ? label : t('notAssignable')}
                            >
                              <span>
                                <Checkbox
                                  checked={checked}
                                  disabled={!assignable || busy}
                                  onChange={(e) =>
                                    toggleRole(row, role, e.target.checked)
                                  }
                                  slotProps={{ input: { 'aria-label': label } }}
                                />
                              </span>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                      {data.canManageMembers && (
                        <TableCell align="right">
                          <Tooltip
                            title={t('removeMember', { name: row.displayName })}
                          >
                            <span>
                              <IconButton
                                color="warning"
                                disabled={busy}
                                onClick={() => setRemoving(row)}
                                aria-label={t('removeMember', {
                                  name: row.displayName,
                                })}
                              >
                                <PersonRemoveIcon />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      <RoleExplanations />

      {removing && (
        <ConfirmDialog
          title={t('removeConfirmTitle', { name: removing.displayName })}
          text={t('removeConfirmText', {
            name: removing.displayName,
            group: data?.groupName ?? groupId,
          })}
          yes={t('remove')}
          no={t('cancel')}
          onConfirm={(confirmed) => {
            const row = removing;
            setRemoving(undefined);
            if (confirmed) removeMember(row);
          }}
        />
      )}
    </Container>
  );
}

/** Was jede Rolle darf — aus dem Katalog, damit Text und Prüfung nie auseinanderlaufen. */
function RoleExplanations() {
  const t = useTranslations('groupRoles');
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {t('explanationTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('explanationIntro')}
      </Typography>
      <Stack spacing={2}>
        {ROLE_IDS.map((role) => (
          <Box key={role}>
            <Typography variant="subtitle1">{t(`roles.${role}.name`)}</Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {t(`roles.${role}.description`)}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {ROLES[role].map((perm) => (
                <Chip
                  key={perm}
                  size="small"
                  variant="outlined"
                  label={t(`permissions.${perm}`)}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
