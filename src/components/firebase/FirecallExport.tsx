'use client';

import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  BACKUP_SECTIONS,
  type BackupProgress,
  type BackupSection,
  type BackupWarning,
  countBackupSections,
  exportFirecall,
} from '../../hooks/useExport';
import LinearProgressWithLabel from '../inputs/LinearProgressWithLabel';
import { useSnackbar } from '../providers/SnackbarProvider';
import { downloadBlob } from './download';
import useBackupProgressText, {
  backupProgressPercent,
} from './useBackupProgressText';
import useBackupWarningText from './useBackupWarningText';

export interface FirecallExportProps {
  firecallId: string;
}

const SECTION_LABEL_KEYS = {
  history: { label: 'sectionHistory', help: 'sectionHistoryHelp' },
  auditlog: { label: 'sectionAuditlog', help: 'sectionAuditlogHelp' },
  attachments: { label: 'sectionAttachments', help: 'sectionAttachmentsHelp' },
} as const satisfies Record<BackupSection, { label: string; help: string }>;

export default function FirecallExport({ firecallId }: FirecallExportProps) {
  const t = useTranslations('backup');
  const tCommon = useTranslations('common');
  const showSnackbar = useSnackbar();
  const warningText = useBackupWarningText();
  const progressText = useBackupProgressText();
  const [progress, setProgress] = useState<BackupProgress>();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Standard ist die vollständige Sicherung — abwählen ist eine bewusste Wahl.
  const [omit, setOmit] = useState<BackupSection[]>([]);
  const [counts, setCounts] =
    useState<Partial<Record<BackupSection, number>>>({});

  const openDialog = useCallback(() => {
    setDialogOpen(true);
    setCounts({});
    // Die Zahlen sind nur ein Hinweis; ohne Netz bleibt der Dialog ohne sie.
    countBackupSections(firecallId)
      .then(setCounts)
      .catch(() => setCounts({}));
  }, [firecallId]);

  const toggleSection = useCallback((section: BackupSection) => {
    setOmit((current) =>
      current.includes(section)
        ? current.filter((s) => s !== section)
        : BACKUP_SECTIONS.filter((s) => s === section || current.includes(s))
    );
  }, []);

  const exportAndDownload = useCallback(async () => {
    const warnings: BackupWarning[] = [];
    try {
      const firecallData = await exportFirecall(firecallId, {
        omit,
        onWarning: (warning) => warnings.push(warning),
        onProgress: setProgress,
      });
      const blob = new Blob([JSON.stringify(firecallData)], {
        type: 'application/json',
      });
      await downloadBlob(blob, `firecall-export-${firecallId}.json`);
      setDialogOpen(false);

      // Eine Sicherung, in der Anhänge fehlen, sieht als Datei vollständig aus.
      // Deshalb wird jeder Fehlschlag angezeigt statt nur protokolliert.
      if (warnings.length > 0) {
        showSnackbar(
          `${t('warningsTitle', { count: warnings.length })}: ${warnings
            .map(warningText)
            .join(' ')}`,
          'warning'
        );
      }
    } catch (err) {
      console.error('firecall export failed', err);
      showSnackbar(t('exportFailed', { error: `${err}` }), 'error');
    } finally {
      setProgress(undefined);
    }
  }, [firecallId, omit, showSnackbar, t, warningText]);

  const inProgress = progress !== undefined;
  const percent = backupProgressPercent(progress);

  return (
    <>
      <Tooltip
        title={
          progress
            ? `${t('exporting')} ${progressText(progress)}`
            : t('exportTooltip')
        }
      >
        <span>
          <IconButton onClick={openDialog} disabled={inProgress}>
            {progress ? (
              // Solange die Gesamtzahl fehlt, dreht der Kreis; danach füllt er sich.
              <CircularProgress
                size={24}
                variant={percent === undefined ? 'indeterminate' : 'determinate'}
                value={percent ?? 0}
              />
            ) : (
              <DownloadIcon />
            )}
          </IconButton>
        </span>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={() => !inProgress && setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('exportTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            {t('exportIntro')}
          </Typography>
          <FormGroup sx={{ mt: 1 }}>
            {BACKUP_SECTIONS.map((section) => {
              const count = counts[section];
              return (
                <Box key={section} sx={{ mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={!omit.includes(section)}
                        onChange={() => toggleSection(section)}
                        disabled={inProgress}
                      />
                    }
                    label={
                      count === undefined
                        ? t(SECTION_LABEL_KEYS[section].label)
                        : `${t(SECTION_LABEL_KEYS[section].label)} (${t(
                            'sectionCount',
                            { count }
                          )})`
                    }
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 4 }}
                  >
                    {t(SECTION_LABEL_KEYS[section].help)}
                  </Typography>
                </Box>
              );
            })}
          </FormGroup>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('exportAlwaysIncluded')}
          </Typography>
          {progress && (
            <Box sx={{ mt: 2 }}>
              <LinearProgressWithLabel
                variant={percent === undefined ? 'indeterminate' : 'determinate'}
                value={percent ?? 0}
              />
              <Typography variant="body2" color="text.secondary">
                {progressText(progress)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={inProgress}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={exportAndDownload}
            variant="contained"
            disabled={inProgress}
          >
            {t('exportAction')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
