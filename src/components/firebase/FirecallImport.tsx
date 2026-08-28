'use client';

import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { NON_TENANT_GROUP_IDS } from '../../app/groups/groupTypes';
import { formatTimestamp } from '../../common/time-format';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import {
  type BackupProgress,
  type BackupWarning,
  type FirecallExport,
  importFirecall,
} from '../../hooks/useExport';
import LinearProgressWithLabel from '../inputs/LinearProgressWithLabel';
import { useSnackbar } from '../providers/SnackbarProvider';
import VisuallyHiddenInput from '../upload/VisuallyHiddenInput';
import readFileAsText from '../upload/readFile';
import useBackupProgressText, {
  backupProgressPercent,
} from './useBackupProgressText';
import useBackupWarningText from './useBackupWarningText';

async function readFileAsJson(file: File): Promise<FirecallExport> {
  const result = await readFileAsText(file);
  return JSON.parse(result);
}

export default function FirecallImport() {
  const t = useTranslations('backup');
  const tCommon = useTranslations('common');
  const showSnackbar = useSnackbar();
  const warningText = useBackupWarningText();
  const progressText = useBackupProgressText();
  const { myGroups } = useFirebaseLogin();

  const [pending, setPending] = useState<FirecallExport>();
  const [targetGroup, setTargetGroup] = useState('');
  const [progress, setProgress] = useState<BackupProgress>();
  const importInProgress = progress !== undefined;

  // Pseudo-Gruppen wie `allUsers` sind keine Mandanten und dürfen nie als
  // Zielgruppe eines Einsatzes herauskommen, siehe `NON_TENANT_GROUP_IDS`.
  const selectableGroups = useMemo(
    () => myGroups.filter((g) => !NON_TENANT_GROUP_IDS.includes(g.id ?? '')),
    [myGroups]
  );

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const firecallData = await readFileAsJson(file);
        if (!firecallData?.name) {
          throw new Error('missing name');
        }
        setPending(firecallData);
        // Die Gruppe aus der Datei ist die Vorbelegung — aber nur, wenn sie
        // für diesen Benutzer überhaupt freigegeben ist.
        const fromFile = selectableGroups.some(
          (g) => g.id === firecallData.group
        )
          ? (firecallData.group as string)
          : (selectableGroups[0]?.id ?? '');
        setTargetGroup(fromFile);
      } catch (err) {
        console.error('could not read firecall backup', err);
        showSnackbar(t('fileInvalid'), 'error');
      }
    },
    [selectableGroups, showSnackbar, t]
  );

  const runImport = useCallback(async () => {
    if (!pending) return;
    const warnings: BackupWarning[] = [];
    try {
      const name = `${pending.name} Kopie ${formatTimestamp(new Date())}`;
      await importFirecall(
        { ...pending, name },
        {
          group: targetGroup || undefined,
          onWarning: (warning) => warnings.push(warning),
          onProgress: setProgress,
        }
      );
      setPending(undefined);
      if (warnings.length > 0) {
        showSnackbar(
          `${t('warningsTitle', { count: warnings.length })}: ${warnings
            .map(warningText)
            .join(' ')}`,
          'warning'
        );
      } else {
        showSnackbar(t('importSuccess', { name }), 'success');
      }
    } catch (err) {
      console.error('firecall import failed', err);
      showSnackbar(t('importFailed', { error: `${err}` }), 'error');
    } finally {
      setProgress(undefined);
    }
  }, [pending, targetGroup, showSnackbar, t, warningText]);

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
      >
        {t('importButton')}
        <VisuallyHiddenInput
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              handleFile(file);
            }
          }}
        />
      </Button>

      <Dialog
        open={pending !== undefined}
        onClose={() => !importInProgress && setPending(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('importTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            {t('importSource', { name: pending?.name ?? '' })}
          </Typography>
          {pending?.group && (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('fileGroup', { group: pending.group })}
            </Typography>
          )}
          <FormControl fullWidth variant="standard" sx={{ mt: 2 }}>
            <InputLabel id="firecall-import-group-label">
              {t('targetGroup')}
            </InputLabel>
            <Select
              labelId="firecall-import-group-label"
              id="firecall-import-group"
              label={t('targetGroup')}
              value={targetGroup}
              onChange={(event) => setTargetGroup(event.target.value)}
            >
              {selectableGroups.map((group) => (
                <MenuItem key={`group-${group.id}`} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{t('targetGroupHelp')}</FormHelperText>
          </FormControl>
          {progress && (
            <Box sx={{ mt: 2 }}>
              <LinearProgressWithLabel
                variant={
                  backupProgressPercent(progress) === undefined
                    ? 'indeterminate'
                    : 'determinate'
                }
                value={backupProgressPercent(progress) ?? 0}
              />
              <Typography variant="body2" color="text.secondary">
                {progressText(progress)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPending(undefined)}
            disabled={importInProgress}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={runImport}
            variant="contained"
            disabled={importInProgress || !targetGroup}
          >
            {t('importAction')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
