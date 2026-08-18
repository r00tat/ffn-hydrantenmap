'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import {
  checkDriveFolder,
  getDriveConfig,
  saveDriveConfig,
} from './driveConfigActions';

/**
 * Basisordner im Google Drive je Gruppe.
 *
 * Gruppen kommen aus `useFahrtenbuchGroup`: derselbe Filter für Pseudo-Gruppen
 * wie im Fahrtenbuch, damit `allUsers` und `kostenersatz` nicht als Mandanten
 * erscheinen.
 */
export default function DriveAdmin() {
  const t = useTranslations('adminDrive');
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();
  const [folderId, setFolderId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    { severity: 'success' | 'error'; text: string } | undefined
  >();

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoaded(false);
    setFeedback(undefined);
    (async () => {
      try {
        const config = await getDriveConfig(groupId);
        if (!active) return;
        setFolderId(config?.baseFolderId ?? '');
        setLoaded(true);
      } catch (err) {
        if (!active) return;
        // Bewusst kein `setLoaded(true)`: Mit leerem Feld und freigeschaltetem
        // Speichern-Knopf würde ein Klick die gepflegte ID überschreiben.
        setFeedback({
          severity: 'error',
          text: t('loadFailed', { message: (err as Error).message }),
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId, t]);

  const onSave = async () => {
    if (!groupId) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await saveDriveConfig(groupId, folderId);
      setFeedback({ severity: 'success', text: t('saved') });
    } catch (err) {
      setFeedback({
        severity: 'error',
        text: t('saveFailed', { message: (err as Error).message }),
      });
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async () => {
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await checkDriveFolder(folderId);
      setFeedback(
        result.success
          ? {
              severity: 'success',
              text: t('checkOk', {
                folder: result.folderName ?? '',
                drive: result.driveName ?? t('noSharedDrive'),
              }),
            }
          : {
              severity: 'error',
              text:
                result.error === 'notAFolder'
                  ? t('checkNotAFolder')
                  : t('checkFailed', { message: result.error ?? '' }),
            },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ p: 2, maxWidth: 720 }}>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('intro')}
      </Typography>

      <Stack spacing={2}>
        <TextField
          select
          size="small"
          label={t('group')}
          value={groupId ?? ''}
          onChange={(e) => setGroupId(e.target.value)}
          disabled={groups.length === 0}
          sx={{ maxWidth: 320 }}
        >
          {groups.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {g.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label={t('baseFolderId')}
          helperText={t('baseFolderIdHelp')}
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          disabled={!loaded || busy}
        />

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={!loaded || busy || !folderId.trim()}
          >
            {t('save')}
          </Button>
          <Button onClick={onCheck} disabled={busy || !folderId.trim()}>
            {t('check')}
          </Button>
        </Stack>

        {groups.length === 0 && <Alert severity="info">{t('noGroups')}</Alert>}
        {feedback && <Alert severity={feedback.severity}>{feedback.text}</Alert>}
      </Stack>
    </Paper>
  );
}
