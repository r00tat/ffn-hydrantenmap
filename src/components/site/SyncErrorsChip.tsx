'use client';

import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import useSyncErrors from '../../hooks/useSyncErrors';
import {
  clearSyncErrors,
  dismissSyncError,
  retrySyncError,
  type SyncError,
} from '../../lib/syncErrors';

/**
 * Roter Chip in der Kopfzeile, sobald der Server Änderungen beim
 * Synchronisieren abgelehnt hat (`syncErrors.ts`). Antippen öffnet die
 * Einzelheiten mit „Erneut versuchen" und „Verwerfen".
 *
 * Ohne diese Anzeige verschwände ein abgelehnter Eintrag still aus dem Cache —
 * offline erfasst, beim Reconnect von den Firestore-Regeln zurückgewiesen.
 */
export default function SyncErrorsChip() {
  const t = useTranslations('networkStatus');
  const errors = useSyncErrors();
  const [open, setOpen] = useState(false);

  if (errors.length === 0) return null;

  return (
    <>
      <Tooltip title={t('syncErrorsHint')}>
        <Chip
          icon={<SyncProblemIcon />}
          label={t('syncErrors', { count: errors.length })}
          color="error"
          size="small"
          onClick={() => setOpen(true)}
          sx={{ ml: 1, mr: 1, flexShrink: 0, maxWidth: { xs: 160, sm: 'none' } }}
        />
      </Tooltip>
      <SyncErrorsDialog
        open={open}
        errors={errors}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

interface SyncErrorsDialogProps {
  open: boolean;
  errors: readonly SyncError[];
  onClose: () => void;
}

export function SyncErrorsDialog({ open, errors, onClose }: SyncErrorsDialogProps) {
  const t = useTranslations('networkStatus');
  const tCommon = useTranslations('common');
  const format = useFormatter();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('syncErrorsTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {errors.length > 0 ? t('syncErrorsIntro') : t('syncErrorsEmpty')}
        </Typography>
        <List dense disablePadding>
          {errors.map((error) => (
            <ListItem
              key={error.id}
              disableGutters
              divider
              alignItems="flex-start"
              sx={{ flexWrap: 'wrap', gap: 1 }}
            >
              <ListItemText
                sx={{ minWidth: 0, flex: '1 1 240px' }}
                primary={
                  <>
                    {t('syncErrorKind', { kind: error.kind })}
                    {' · '}
                    {format.dateTime(new Date(error.timestamp), {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </>
                }
                secondary={
                  <>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ display: 'block', wordBreak: 'break-all' }}
                    >
                      {error.path}
                    </Typography>
                    <Typography component="span" variant="caption" sx={{ display: 'block' }}>
                      {t('syncErrorCode', { code: error.code })}
                    </Typography>
                    {error.message && error.message !== error.code && (
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {error.message}
                      </Typography>
                    )}
                  </>
                }
              />
              <Stack direction="row" spacing={1} sx={{ alignSelf: 'center' }}>
                {error.canRetry && (
                  <Button size="small" onClick={() => retrySyncError(error.id)}>
                    {t('syncErrorRetry')}
                  </Button>
                )}
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => dismissSyncError(error.id)}
                >
                  {t('syncErrorDiscard')}
                </Button>
              </Stack>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        {errors.length > 1 && (
          <Button color="warning" onClick={() => clearSyncErrors()}>
            {t('syncErrorsDiscardAll')}
          </Button>
        )}
        <Button onClick={onClose}>{tCommon('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
