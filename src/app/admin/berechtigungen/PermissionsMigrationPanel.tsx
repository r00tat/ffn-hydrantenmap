'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import type { GroupRoles } from '../../../common/permissions';
import {
  getPermissionsMigrationState,
  migrateUserRoles,
  recomputeAllPermissions,
  removeLegacyRoleFields,
  type PermissionsMigrationState,
} from './actions';
import {
  migrationGroupRoles,
  type MigrationStepResult,
  type RecomputeResult,
  type UserMigrationPreview,
} from './permissionsMigration';

type Step = 'migrate' | 'cleanup' | 'recompute';

/**
 * Seite `/admin/berechtigungen`: Umstellung der alten Rollenfelder auf
 * `groupRoles` in drei Schritten plus „Rechte neu ableiten". Die Server
 * Actions prüfen `actionAdminRequired` selbst — das Layout ist nur Anzeige.
 */
export default function PermissionsMigrationPanel() {
  const t = useTranslations('adminPermissions');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  const [state, setState] = useState<PermissionsMigrationState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<Step>();
  const [confirm, setConfirm] = useState<'migrate' | 'cleanup'>();
  // Nur geänderte Häkchen; wer fehlt, bekommt die Vorbelegung.
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [onlyPending, setOnlyPending] = useState(true);

  const reload = useCallback(async () => {
    try {
      setState(await getPermissionsMigrationState());
    } catch (err) {
      setError(t('loadError', { message: (err as Error).message }));
    }
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (step: Step) => {
    setConfirm(undefined);
    setBusy(step);
    setError(undefined);
    try {
      if (step === 'migrate') await migrateUserRoles(selection);
      else if (step === 'cleanup') await removeLegacyRoleFields();
      else await recomputeAllPermissions();
      setSelection({});
      await reload();
    } catch (err) {
      setError(t('actionError', { message: (err as Error).message }));
    } finally {
      setBusy(undefined);
    }
  };

  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'short', timeStyle: 'short' });

  const users = state?.users;
  const pendingCount = state ? state.cleanup.notMigrated : 0;
  const visibleUsers = useMemo(
    () => (users ?? []).filter((u) => !onlyPending || !u.migrated),
    [users, onlyPending],
  );

  if (!state) {
    return (
      <Box>
        {error && <Alert severity="error">{error}</Alert>}
        {!error && (
          <Stack direction="row" spacing={1} sx={{ my: 3, alignItems: 'center' }}>
            <CircularProgress size={20} />
            <Typography variant="body2">{tCommon('loading')}</Typography>
          </Stack>
        )}
      </Box>
    );
  }

  const toggleKostenersatz = (user: UserMigrationPreview, groupId: string) => {
    setSelection((prev) => {
      const current = prev[user.uid] ?? user.kostenersatzGroups;
      const next = current.includes(groupId)
        ? current.filter((g) => g !== groupId)
        : [...current, groupId];
      return { ...prev, [user.uid]: next };
    });
  };

  const rolesFor = (user: UserMigrationPreview): GroupRoles =>
    user.migrated || !(user.uid in selection)
      ? user.groupRoles
      : migrationGroupRoles({ uid: user.uid, ...user.legacy }, selection[user.uid]);

  const { cleanup, log } = state;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('pageTitle')}
      </Typography>
      <Typography variant="body1" gutterBottom>
        {t('intro')}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {t('summary', {
          total: cleanup.total,
          migrated: cleanup.total - cleanup.notMigrated,
          pending: cleanup.notMigrated,
          legacy: cleanup.withLegacyFields,
        })}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ my: 2 }} onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}

      <Section title={t('step2Title')} text={t('step2Text')}>
        <Button
          variant="contained"
          disabled={!!busy || pendingCount === 0}
          onClick={() => setConfirm('migrate')}
          startIcon={busy === 'migrate' ? <CircularProgress size={16} /> : undefined}
        >
          {t('migrateButton', { count: pendingCount })}
        </Button>
        <StepLog result={log.migrate} formatDate={formatDate} />
      </Section>

      <Section title={t('step3Title')} text={t('step3Text')}>
        <Tooltip
          title={
            cleanup.allowed ? '' : t('cleanupBlocked', { pending: cleanup.notMigrated })
          }
        >
          <span>
            <Button
              variant="outlined"
              color="warning"
              disabled={!!busy || !cleanup.allowed}
              onClick={() => setConfirm('cleanup')}
              startIcon={busy === 'cleanup' ? <CircularProgress size={16} /> : undefined}
            >
              {t('cleanupButton')}
            </Button>
          </span>
        </Tooltip>
        <StepLog result={log.cleanup} formatDate={formatDate} />
      </Section>

      <Section title={t('recomputeTitle')} text={t('recomputeText')}>
        <Button
          variant="outlined"
          disabled={!!busy}
          onClick={() => run('recompute')}
          startIcon={busy === 'recompute' ? <CircularProgress size={16} /> : undefined}
        >
          {t('recomputeButton')}
        </Button>
        <RecomputeLog result={log.recompute} formatDate={formatDate} />
      </Section>

      <Section title={t('step1Title')} text={t('step1Text')}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
              />
            }
            label={t('onlyPending')}
          />
          <Button onClick={reload} disabled={!!busy}>
            {t('reload')}
          </Button>
        </Stack>
        {visibleUsers.length === 0 ? (
          <Typography variant="body2">{t('noUsers')}</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('columnUser')}</TableCell>
                  <TableCell>{t('columnStatus')}</TableCell>
                  <TableCell>{t('columnLegacy')}</TableCell>
                  <TableCell>{t('columnRoles')}</TableCell>
                  <TableCell>{t('columnKostenersatz')}</TableCell>
                  <TableCell>{t('columnHints')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleUsers.map((user) => (
                  <PreviewRow
                    key={user.uid}
                    user={user}
                    groupRoles={rolesFor(user)}
                    kostenersatzGroups={
                      selection[user.uid] ?? user.kostenersatzGroups
                    }
                    onToggle={(groupId) => toggleKostenersatz(user, groupId)}
                    disabled={!!busy}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Section>

      <Dialog open={!!confirm} onClose={() => setConfirm(undefined)}>
        <DialogTitle>
          {confirm === 'cleanup' ? t('cleanupConfirmTitle') : t('migrateConfirmTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm === 'cleanup'
              ? t('cleanupConfirmText')
              : t('migrateConfirmText', { count: pendingCount })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(undefined)}>{t('cancel')}</Button>
          <Button
            variant="contained"
            color={confirm === 'cleanup' ? 'warning' : 'primary'}
            onClick={() => confirm && run(confirm)}
          >
            {t('confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Section({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ my: 3 }}>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {text}
      </Typography>
      {children}
    </Box>
  );
}

function StepLog({
  result,
  formatDate,
}: {
  result?: MigrationStepResult;
  formatDate: (value: string) => string;
}) {
  const t = useTranslations('adminPermissions');
  if (!result) return null;
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2">
        {t('lastRun', { at: formatDate(result.at), by: result.by })}
        {' — '}
        {t('resultCounts', {
          processed: result.processed,
          skipped: result.skipped,
          errors: result.errors.length,
        })}
      </Typography>
      {result.errors.length > 0 && (
        <Alert severity="error" sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            {t('errorsTitle')}
          </Typography>
          {result.errors.map((e) => (
            <Typography variant="body2" key={e.uid}>
              {e.uid}: {e.message}
            </Typography>
          ))}
        </Alert>
      )}
    </Box>
  );
}

function RecomputeLog({
  result,
  formatDate,
}: {
  result?: RecomputeResult;
  formatDate: (value: string) => string;
}) {
  const t = useTranslations('adminPermissions');
  if (!result) return null;
  return (
    <Box>
      <StepLog result={result} formatDate={formatDate} />
      {result.notMigrated > 0 && (
        <Typography variant="body2" color="warning.main">
          {t('resultNotMigrated', { count: result.notMigrated })}
        </Typography>
      )}
      {result.deviations.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('noDeviations')}
        </Typography>
      ) : (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            {t('deviationsTitle')}
          </Typography>
          {result.deviations.map((d) => (
            <Typography variant="body2" key={d.uid}>
              {d.label}: {d.deviations.map((code) => t(`deviation.${code}`)).join(', ')}
            </Typography>
          ))}
        </Alert>
      )}
    </Box>
  );
}

function PreviewRow({
  user,
  groupRoles,
  kostenersatzGroups,
  onToggle,
  disabled,
}: {
  user: UserMigrationPreview;
  groupRoles: GroupRoles;
  kostenersatzGroups: string[];
  onToggle: (groupId: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations('adminPermissions');
  const legacyLines: [string, string[]][] = [
    [t('legacyGroups'), user.legacy.groups],
    [t('legacyGroupAdmin'), user.legacy.groupAdmin],
    [t('legacyGeraetemeister'), user.legacy.fahrtenbuchGeraetemeister],
    [t('legacyBekleidungswart'), user.legacy.bekleidungswart],
  ];
  const groups = Object.keys(groupRoles).sort();

  return (
    <TableRow sx={{ verticalAlign: 'top' }}>
      <TableCell>
        <Typography variant="body2">{user.label}</Typography>
        {user.email && user.email !== user.label && (
          <Typography variant="caption" color="text.secondary">
            {user.email}
          </Typography>
        )}
      </TableCell>
      <TableCell>
        <Chip
          size="small"
          color={user.migrated ? 'success' : 'default'}
          label={user.migrated ? t('statusMigrated') : t('statusPending')}
        />
      </TableCell>
      <TableCell>
        {legacyLines
          .filter(([, values]) => values.length > 0)
          .map(([label, values]) => (
            <Typography variant="body2" key={label}>
              {label}: {values.join(', ')}
            </Typography>
          ))}
      </TableCell>
      <TableCell>
        {groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('noMembership')}
          </Typography>
        ) : (
          groups.map((groupId) => (
            <Typography variant="body2" component="div" key={groupId}>
              {groupId}:{' '}
              {groupRoles[groupId].length === 0
                ? t('noRoles')
                : groupRoles[groupId]
                    .map((role) => (t.has(`role.${role}`) ? t(`role.${role}`) : role))
                    .join(', ')}
            </Typography>
          ))
        )}
      </TableCell>
      <TableCell>
        {user.hasKostenersatz &&
          !user.migrated &&
          user.memberGroups.map((groupId) => (
            <FormControlLabel
              key={groupId}
              control={
                <Checkbox
                  size="small"
                  checked={kostenersatzGroups.includes(groupId)}
                  onChange={() => onToggle(groupId)}
                  disabled={disabled}
                />
              }
              label={groupId}
            />
          ))}
      </TableCell>
      <TableCell>
        {user.migrated && (
          <Typography variant="body2" color="text.secondary">
            {t('hintSkipped')}
          </Typography>
        )}
        {user.withoutTenantGroup && !user.migrated && (
          <Typography variant="body2" color="warning.main">
            {t('hintWithoutTenantGroup')}
          </Typography>
        )}
        {user.droppedRoles.map(({ groupId, role }) => (
          <Typography variant="body2" color="warning.main" key={`${groupId}-${role}`}>
            {t('hintDroppedRole', { role: t(`role.${role}`), group: groupId })}
          </Typography>
        ))}
      </TableCell>
    </TableRow>
  );
}
